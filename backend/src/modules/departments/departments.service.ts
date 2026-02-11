import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UserRole, Prisma } from '@prisma/client';

export interface CreateDepartmentDto {
  name: string;
  description?: string;
  costCenter?: string;
  managerId?: string;
  tenantId: string;
}

export interface UpdateDepartmentDto {
  name?: string;
  description?: string;
  costCenter?: string;
  managerId?: string;
  isActive?: boolean;
}

export interface DepartmentFilterDto {
  tenantId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: DepartmentFilterDto, requestingUser: any) {
    const { tenantId, search, page = 1, limit = 20 } = filters;

    // Determine tenant scope
    let targetTenantId = tenantId;
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      targetTenantId = requestingUser.tenantId;
    }

    if (!targetTenantId) {
      throw new ForbiddenException('Tenant ID required');
    }

    const where: Prisma.DepartmentWhereInput = {
      tenantId: targetTenantId,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { costCenter: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [departments, total] = await Promise.all([
      this.prisma.department.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              subscriptions: true,
            },
          },
        },
      }),
      this.prisma.department.count({ where }),
    ]);

    return {
      data: departments,
      meta: {
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit),
      },
    };
  }

  async findAllByTenant(tenantId: string, requestingUser: any) {
    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN && tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.department.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        costCenter: true,
      },
    });
  }

  async findOne(id: string, requestingUser: any) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (department.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied to this department');
      }
    }

    return department;
  }

  async create(dto: CreateDepartmentDto, requestingUser: any) {
    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (dto.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Cannot create department for different tenant');
      }
    }

    // Check if name already exists in tenant
    const existing = await this.prisma.department.findFirst({
      where: {
        tenantId: dto.tenantId,
        name: dto.name,
      },
    });

    if (existing) {
      throw new ConflictException('Department with this name already exists');
    }

    // Validate manager if provided
    if (dto.managerId) {
      const manager = await this.prisma.user.findFirst({
        where: {
          id: dto.managerId,
          tenantId: dto.tenantId,
        },
      });

      if (!manager) {
        throw new NotFoundException('Manager not found in this tenant');
      }
    }

    const department = await this.prisma.department.create({
      data: {
        name: dto.name,
        description: dto.description,
        costCenter: dto.costCenter,
        managerId: dto.managerId,
        tenantId: dto.tenantId,
      },
    });

    return department;
  }

  async update(id: string, dto: UpdateDepartmentDto, requestingUser: any) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (department.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied to this department');
      }
    }

    // Check name uniqueness if changing name
    if (dto.name && dto.name !== department.name) {
      const existing = await this.prisma.department.findFirst({
        where: {
          tenantId: department.tenantId,
          name: dto.name,
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException('Department with this name already exists');
      }
    }

    // Validate manager if provided
    if (dto.managerId) {
      const manager = await this.prisma.user.findFirst({
        where: {
          id: dto.managerId,
          tenantId: department.tenantId,
        },
      });

      if (!manager) {
        throw new NotFoundException('Manager not found in this tenant');
      }
    }

    const updated = await this.prisma.department.update({
      where: { id },
      data: dto,
    });

    return updated;
  }

  async remove(id: string, requestingUser: any) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (department.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied to this department');
      }
    }

    // Check if department has subscriptions
    if (department._count.subscriptions > 0) {
      // Soft delete by deactivating
      await this.prisma.department.update({
        where: { id },
        data: { isActive: false },
      });

      return { message: 'Department deactivated (has subscriptions)' };
    }

    // Hard delete if no subscriptions
    await this.prisma.department.delete({
      where: { id },
    });

    return { message: 'Department deleted successfully' };
  }
}
