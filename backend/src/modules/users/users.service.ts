import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '@/prisma/prisma.service';
import { UserRole, UserStatus, Prisma } from '@prisma/client';

export interface CreateUserDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  tenantId?: string;
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  status?: UserStatus;
}

export interface UserFilterDto {
  tenantId?: string;
  role?: UserRole;
  status?: UserStatus;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: UserFilterDto, requestingUser: any) {
    const { tenantId, role, status, search, page = 1, limit = 20 } = filters;

    // Build where clause
    const where: Prisma.UserWhereInput = {};

    // Tenant filtering
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      where.tenantId = requestingUser.tenantId;
    } else if (tenantId) {
      where.tenantId = tenantId;
    }

    if (role) where.role = role;
    if (status) where.status = status;

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          tenantId: true,
          lastLoginAt: true,
          createdAt: true,
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, requestingUser: any) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (user.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied to this user');
      }
    }

    // Remove password hash from response
    const { passwordHash, ...result } = user;
    return result;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase() },
    });
  }

  async create(dto: CreateUserDto, requestingUser: any) {
    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (dto.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Cannot create user for different tenant');
      }
      // TENANT_ADMIN can only create users with role <= MANAGER
      if (dto.role === UserRole.SUPER_ADMIN || dto.role === UserRole.TENANT_ADMIN) {
        throw new ForbiddenException('Cannot create user with this role');
      }
    }

    // Check if user already exists in tenant
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        tenantId: dto.tenantId || null,
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists in this tenant');
    }

    // Hash password
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        tenantId: dto.tenantId,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        tenantId: true,
        createdAt: true,
      },
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto, requestingUser: any) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (user.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied to this user');
      }
      // Cannot update role to higher than own role
      if (dto.role && (dto.role === UserRole.SUPER_ADMIN || dto.role === UserRole.TENANT_ADMIN)) {
        throw new ForbiddenException('Cannot assign this role');
      }
      // Cannot update own role
      if (id === requestingUser.userId && dto.role) {
        throw new ForbiddenException('Cannot change your own role');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        tenantId: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  async remove(id: string, requestingUser: any) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (user.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied to this user');
      }
      // Cannot delete super admin or tenant admin
      if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.TENANT_ADMIN) {
        throw new ForbiddenException('Cannot delete this user');
      }
    }

    // Cannot delete yourself
    if (id === requestingUser.userId) {
      throw new BadRequestException('Cannot delete your own account');
    }

    // Soft delete by setting status to INACTIVE
    await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.INACTIVE },
    });

    // Revoke all refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId: id },
      data: { revokedAt: new Date() },
    });

    return { message: 'User deactivated successfully' };
  }

  async inviteUser(
    email: string,
    role: UserRole,
    tenantId: string,
    requestingUser: any,
  ) {
    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Cannot invite to different tenant');
      }
      if (role === UserRole.SUPER_ADMIN || role === UserRole.TENANT_ADMIN) {
        throw new ForbiddenException('Cannot invite with this role');
      }
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        tenantId,
      },
    });

    if (existingUser) {
      throw new ConflictException('User already exists in this tenant');
    }

    // Create user with pending status and temporary password
    const tempPassword = this.generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword);

    const user = await this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName: '',
        lastName: '',
        role,
        tenantId,
        status: UserStatus.PENDING,
      },
    });

    // TODO: Send invitation email with temp password

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      },
      tempPassword, // In production, this should only be sent via email
    };
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
