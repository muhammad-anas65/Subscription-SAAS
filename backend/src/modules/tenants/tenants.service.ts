import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UserRole, Prisma } from '@prisma/client';

export interface CreateTenantDto {
  name: string;
  slug: string;
  description?: string;
  branding?: {
    appName?: string;
    primaryColor?: string;
    logoUrl?: string;
  };
}

export interface UpdateTenantDto {
  name?: string;
  description?: string;
  isActive?: boolean;
  branding?: {
    appName?: string;
    primaryColor?: string;
    logoUrl?: string;
    faviconUrl?: string;
    customCss?: string;
  };
}

export interface TenantFilterDto {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: TenantFilterDto, requestingUser: any) {
    // Only SUPER_ADMIN can list all tenants
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can list all tenants');
    }

    const { search, isActive, page = 1, limit = 20 } = filters;

    const where: Prisma.TenantWhereInput = {};

    if (isActive !== undefined) where.isActive = isActive;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              users: true,
              subscriptions: true,
            },
          },
          branding: {
            select: {
              appName: true,
              primaryColor: true,
              logoUrl: true,
            },
          },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      data: tenants,
      meta: {
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit),
      },
    };
  }

  async findOne(idOrSlug: string, requestingUser: any) {
    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (idOrSlug !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied to this tenant');
      }
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          { id: idOrSlug },
          { slug: idOrSlug },
        ],
      },
      include: {
        branding: true,
        _count: {
          select: {
            users: true,
            subscriptions: true,
            departments: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async findBySlug(slug: string) {
    return this.prisma.tenant.findUnique({
      where: { slug },
      include: {
        branding: true,
      },
    });
  }

  async create(dto: CreateTenantDto, requestingUser: any) {
    // Only SUPER_ADMIN can create tenants
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can create tenants');
    }

    // Check if slug is already taken
    const existingSlug = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });

    if (existingSlug) {
      throw new ConflictException('Tenant slug already exists');
    }

    // Create tenant with branding in transaction
    const tenant = await this.prisma.$transaction(async (tx) => {
      const newTenant = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          isActive: true,
        },
      });

      // Create default branding if provided
      if (dto.branding) {
        await tx.tenantBranding.create({
          data: {
            tenantId: newTenant.id,
            appName: dto.branding.appName,
            primaryColor: dto.branding.primaryColor,
            logoUrl: dto.branding.logoUrl,
          },
        });
      }

      // Create default alert settings
      await tx.alertSettings.create({
        data: {
          tenantId: newTenant.id,
          enable14Days: true,
          enable7Days: true,
          enable3Days: true,
          enableTomorrow: true,
          enableOverdue: true,
          enableMonthlySummary: true,
          enableDataQuality: true,
          timezone: 'UTC',
        },
      });

      return newTenant;
    });

    return this.findOne(tenant.id, requestingUser);
  }

  async update(id: string, dto: UpdateTenantDto, requestingUser: any) {
    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (id !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied to this tenant');
      }
      // Non-super admins can only update branding
      const allowedUpdates = ['branding'];
      const attemptedUpdates = Object.keys(dto).filter(k => k !== 'branding');
      if (attemptedUpdates.length > 0) {
        throw new ForbiddenException('Can only update branding');
      }
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Update in transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      // Update tenant fields
      const tenantUpdate: Prisma.TenantUpdateInput = {};
      if (dto.name !== undefined) tenantUpdate.name = dto.name;
      if (dto.description !== undefined) tenantUpdate.description = dto.description;
      if (dto.isActive !== undefined) tenantUpdate.isActive = dto.isActive;

      await tx.tenant.update({
        where: { id },
        data: tenantUpdate,
      });

      // Update or create branding
      if (dto.branding) {
        await tx.tenantBranding.upsert({
          where: { tenantId: id },
          create: {
            tenantId: id,
            ...dto.branding,
          },
          update: dto.branding,
        });
      }

      return tx.tenant.findUnique({
        where: { id },
        include: { branding: true },
      });
    });

    return updated;
  }

  async remove(id: string, requestingUser: any) {
    // Only SUPER_ADMIN can delete tenants
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can delete tenants');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            subscriptions: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Soft delete by deactivating
    await this.prisma.tenant.update({
      where: { id },
      data: { isActive: false },
    });

    // Deactivate all users
    await this.prisma.user.updateMany({
      where: { tenantId: id },
      data: { status: 'INACTIVE' },
    });

    return { message: 'Tenant deactivated successfully' };
  }

  async getBranding(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      include: { branding: true },
    });

    if (!tenant || !tenant.isActive) {
      return null;
    }

    return {
      name: tenant.name,
      slug: tenant.slug,
      branding: tenant.branding || {},
    };
  }

  async getStats(id: string, requestingUser: any) {
    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN && id !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const [
      userCount,
      subscriptionCount,
      departmentCount,
      activeSubscriptions,
      totalMonthlySpend,
    ] = await Promise.all([
      this.prisma.user.count({ where: { tenantId: id } }),
      this.prisma.subscription.count({ where: { tenantId: id } }),
      this.prisma.department.count({ where: { tenantId: id } }),
      this.prisma.subscription.count({
        where: { tenantId: id, status: 'ACTIVE' },
      }),
      this.prisma.subscription.aggregate({
        where: {
          tenantId: id,
          status: 'ACTIVE',
          billingCycle: 'MONTHLY',
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      userCount,
      subscriptionCount,
      departmentCount,
      activeSubscriptions,
      totalMonthlySpend: totalMonthlySpend._sum.amount || 0,
    };
  }
}
