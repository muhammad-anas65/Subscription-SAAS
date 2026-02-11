import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UserRole, BillingCycle, SubscriptionStatus, Prisma } from '@prisma/client';
import { addDays, addWeeks, addMonths, addQuarters, addYears, format, startOfMonth, endOfMonth } from 'date-fns';

export interface CreateSubscriptionDto {
  vendorName: string;
  serviceName: string;
  planName?: string;
  description?: string;
  amount: number;
  currency?: string;
  billingCycle: BillingCycle;
  customDays?: number;
  startDate: Date;
  nextRenewalDate?: Date;
  autoRenew?: boolean;
  departmentId?: string;
  ownerId?: string;
  costCenter?: string;
  contractUrl?: string;
  invoiceUrl?: string;
  vendorWebsite?: string;
  adminPortalUrl?: string;
  tags?: string[];
  notes?: string;
  tenantId: string;
}

export interface UpdateSubscriptionDto {
  vendorName?: string;
  serviceName?: string;
  planName?: string;
  description?: string;
  amount?: number;
  currency?: string;
  billingCycle?: BillingCycle;
  customDays?: number;
  nextRenewalDate?: Date;
  autoRenew?: boolean;
  status?: SubscriptionStatus;
  departmentId?: string;
  ownerId?: string;
  costCenter?: string;
  contractUrl?: string;
  invoiceUrl?: string;
  vendorWebsite?: string;
  adminPortalUrl?: string;
  tags?: string[];
  notes?: string;
}

export interface SubscriptionFilterDto {
  tenantId?: string;
  status?: SubscriptionStatus;
  departmentId?: string;
  ownerId?: string;
  billingCycle?: BillingCycle;
  search?: string;
  tags?: string[];
  upcomingDays?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: SubscriptionFilterDto, requestingUser: any) {
    const {
      tenantId,
      status,
      departmentId,
      ownerId,
      billingCycle,
      search,
      tags,
      upcomingDays,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filters;

    // Determine tenant scope
    let targetTenantId = tenantId;
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      targetTenantId = requestingUser.tenantId;
    }

    if (!targetTenantId) {
      throw new ForbiddenException('Tenant ID required');
    }

    const where: Prisma.SubscriptionWhereInput = {
      tenantId: targetTenantId,
    };

    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;
    if (ownerId) where.ownerId = ownerId;
    if (billingCycle) where.billingCycle = billingCycle;

    if (search) {
      where.OR = [
        { vendorName: { contains: search, mode: 'insensitive' } },
        { serviceName: { contains: search, mode: 'insensitive' } },
        { planName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (tags && tags.length > 0) {
      where.tags = { hasEvery: tags };
    }

    if (upcomingDays) {
      const now = new Date();
      const future = addDays(now, upcomingDays);
      where.nextRenewalDate = {
        gte: now,
        lte: future,
      };
      where.status = 'ACTIVE';
    }

    const skip = (page - 1) * limit;
    const orderBy: Prisma.SubscriptionOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [subscriptions, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          department: {
            select: {
              id: true,
              name: true,
              costCenter: true,
            },
          },
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          _count: {
            select: {
              attachments: true,
            },
          },
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      data: subscriptions,
      meta: {
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, requestingUser: any) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            costCenter: true,
          },
        },
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        attachments: {
          select: {
            id: true,
            fileName: true,
            originalName: true,
            mimeType: true,
            fileSize: true,
            description: true,
            createdAt: true,
            uploadedBy: true,
          },
        },
        alertLogs: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            ruleType: true,
            status: true,
            sentAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (subscription.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied to this subscription');
      }
    }

    return subscription;
  }

  async create(dto: CreateSubscriptionDto, requestingUser: any) {
    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (dto.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Cannot create subscription for different tenant');
      }
    }

    // Validate department
    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: {
          id: dto.departmentId,
          tenantId: dto.tenantId,
        },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
    }

    // Validate owner
    if (dto.ownerId) {
      const owner = await this.prisma.user.findFirst({
        where: {
          id: dto.ownerId,
          tenantId: dto.tenantId,
        },
      });
      if (!owner) {
        throw new NotFoundException('Owner not found');
      }
    }

    // Calculate next renewal date if not provided
    let nextRenewalDate = dto.nextRenewalDate;
    if (!nextRenewalDate) {
      nextRenewalDate = this.calculateNextRenewalDate(
        dto.startDate,
        dto.billingCycle,
        dto.customDays,
      );
    }

    const subscription = await this.prisma.subscription.create({
      data: {
        vendorName: dto.vendorName,
        serviceName: dto.serviceName,
        planName: dto.planName,
        description: dto.description,
        amount: dto.amount,
        currency: dto.currency || 'USD',
        billingCycle: dto.billingCycle,
        customDays: dto.customDays,
        startDate: dto.startDate,
        nextRenewalDate,
        autoRenew: dto.autoRenew ?? true,
        status: SubscriptionStatus.ACTIVE,
        departmentId: dto.departmentId,
        ownerId: dto.ownerId,
        costCenter: dto.costCenter,
        contractUrl: dto.contractUrl,
        invoiceUrl: dto.invoiceUrl,
        vendorWebsite: dto.vendorWebsite,
        adminPortalUrl: dto.adminPortalUrl,
        tags: dto.tags || [],
        notes: dto.notes,
        tenantId: dto.tenantId,
        createdBy: requestingUser.userId,
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Create audit log
    await this.createAuditLog(
      dto.tenantId,
      requestingUser.userId,
      'CREATE',
      'subscription',
      subscription.id,
      null,
      subscription,
    );

    return subscription;
  }

  async update(id: string, dto: UpdateSubscriptionDto, requestingUser: any) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (subscription.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied to this subscription');
      }
    }

    // Validate department if changing
    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: {
          id: dto.departmentId,
          tenantId: subscription.tenantId,
        },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
    }

    // Validate owner if changing
    if (dto.ownerId) {
      const owner = await this.prisma.user.findFirst({
        where: {
          id: dto.ownerId,
          tenantId: subscription.tenantId,
        },
      });
      if (!owner) {
        throw new NotFoundException('Owner not found');
      }
    }

    // Recalculate next renewal if billing cycle changed
    let nextRenewalDate = dto.nextRenewalDate;
    if (dto.billingCycle && dto.billingCycle !== subscription.billingCycle) {
      nextRenewalDate = this.calculateNextRenewalDate(
        subscription.startDate,
        dto.billingCycle,
        dto.customDays,
      );
    }

    const oldValues = { ...subscription };

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: {
        ...dto,
        nextRenewalDate,
        updatedBy: requestingUser.userId,
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Create audit log
    await this.createAuditLog(
      subscription.tenantId,
      requestingUser.userId,
      'UPDATE',
      'subscription',
      id,
      oldValues,
      updated,
    );

    return updated;
  }

  async cancel(id: string, requestingUser: any) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (subscription.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    const oldValues = { ...subscription };

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: {
        status: SubscriptionStatus.CANCELED,
        autoRenew: false,
        canceledAt: new Date(),
        updatedBy: requestingUser.userId,
      },
    });

    // Create audit log
    await this.createAuditLog(
      subscription.tenantId,
      requestingUser.userId,
      'UPDATE',
      'subscription',
      id,
      oldValues,
      updated,
    );

    return updated;
  }

  async pause(id: string, requestingUser: any) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (subscription.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    const oldValues = { ...subscription };

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: {
        status: SubscriptionStatus.PAUSED,
        updatedBy: requestingUser.userId,
      },
    });

    await this.createAuditLog(
      subscription.tenantId,
      requestingUser.userId,
      'UPDATE',
      'subscription',
      id,
      oldValues,
      updated,
    );

    return updated;
  }

  async resume(id: string, requestingUser: any) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (subscription.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    const oldValues = { ...subscription };

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        updatedBy: requestingUser.userId,
      },
    });

    await this.createAuditLog(
      subscription.tenantId,
      requestingUser.userId,
      'UPDATE',
      'subscription',
      id,
      oldValues,
      updated,
    );

    return updated;
  }

  async duplicate(id: string, requestingUser: any) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (subscription.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    const { id: _, createdAt, updatedAt, createdBy, updatedBy, ...data } = subscription;

    const duplicated = await this.prisma.subscription.create({
      data: {
        ...data,
        serviceName: `${data.serviceName} (Copy)`,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        nextRenewalDate: this.calculateNextRenewalDate(
          new Date(),
          data.billingCycle,
          data.customDays,
        ),
        createdBy: requestingUser.userId,
      },
    });

    await this.createAuditLog(
      subscription.tenantId,
      requestingUser.userId,
      'CREATE',
      'subscription',
      duplicated.id,
      null,
      duplicated,
    );

    return duplicated;
  }

  async remove(id: string, requestingUser: any) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (subscription.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    await this.createAuditLog(
      subscription.tenantId,
      requestingUser.userId,
      'DELETE',
      'subscription',
      id,
      subscription,
      null,
    );

    await this.prisma.subscription.delete({
      where: { id },
    });

    return { message: 'Subscription deleted successfully' };
  }

  async getUpcomingRenewals(tenantId: string, days: number, requestingUser: any) {
    if (requestingUser.role !== UserRole.SUPER_ADMIN && tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const now = new Date();
    const future = addDays(now, days);

    return this.prisma.subscription.findMany({
      where: {
        tenantId,
        status: SubscriptionStatus.ACTIVE,
        nextRenewalDate: {
          gte: now,
          lte: future,
        },
      },
      orderBy: {
        nextRenewalDate: 'asc',
      },
      include: {
        department: {
          select: {
            name: true,
          },
        },
        owner: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async getStats(tenantId: string, requestingUser: any) {
    if (requestingUser.role !== UserRole.SUPER_ADMIN && tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const now = new Date();
    const thirtyDaysFromNow = addDays(now, 30);

    const [
      totalSubscriptions,
      activeSubscriptions,
      canceledSubscriptions,
      monthlySpend,
      annualSpend,
      upcomingRenewals,
      byBillingCycle,
      byDepartment,
    ] = await Promise.all([
      this.prisma.subscription.count({ where: { tenantId } }),
      this.prisma.subscription.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.subscription.count({ where: { tenantId, status: 'CANCELED' } }),
      this.prisma.subscription.aggregate({
        where: {
          tenantId,
          status: 'ACTIVE',
          billingCycle: 'MONTHLY',
        },
        _sum: { amount: true },
      }),
      this.prisma.subscription.aggregate({
        where: {
          tenantId,
          status: 'ACTIVE',
          billingCycle: 'ANNUAL',
        },
        _sum: { amount: true },
      }),
      this.prisma.subscription.count({
        where: {
          tenantId,
          status: 'ACTIVE',
          nextRenewalDate: {
            gte: now,
            lte: thirtyDaysFromNow,
          },
        },
      }),
      this.prisma.subscription.groupBy({
        by: ['billingCycle'],
        where: { tenantId, status: 'ACTIVE' },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.subscription.groupBy({
        by: ['departmentId'],
        where: { tenantId, status: 'ACTIVE' },
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    // Get department names
    const departmentIds = byDepartment.map(d => d.departmentId).filter(Boolean);
    const departments = await this.prisma.department.findMany({
      where: { id: { in: departmentIds as string[] } },
      select: { id: true, name: true },
    });

    const departmentMap = new Map(departments.map(d => [d.id, d.name]));

    return {
      totalSubscriptions,
      activeSubscriptions,
      canceledSubscriptions,
      monthlySpend: monthlySpend._sum.amount || 0,
      annualSpend: annualSpend._sum.amount || 0,
      estimatedAnnualSpend: (
        (monthlySpend._sum.amount || 0) * 12 +
        (annualSpend._sum.amount || 0)
      ),
      upcomingRenewals,
      byBillingCycle: byBillingCycle.map(bc => ({
        cycle: bc.billingCycle,
        count: bc._count.id,
        totalAmount: bc._sum.amount || 0,
      })),
      byDepartment: byDepartment.map(d => ({
        departmentId: d.departmentId,
        departmentName: d.departmentId ? departmentMap.get(d.departmentId) : 'Unassigned',
        count: d._count.id,
        totalAmount: d._sum.amount || 0,
      })),
    };
  }

  async exportToCsv(tenantId: string, requestingUser: any) {
    if (requestingUser.role !== UserRole.SUPER_ADMIN && tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const subscriptions = await this.prisma.subscription.findMany({
      where: { tenantId },
      include: {
        department: true,
        owner: true,
      },
    });

    // CSV headers
    const headers = [
      'ID',
      'Vendor Name',
      'Service Name',
      'Plan Name',
      'Amount',
      'Currency',
      'Billing Cycle',
      'Status',
      'Start Date',
      'Next Renewal',
      'Department',
      'Owner',
      'Cost Center',
      'Auto Renew',
      'Tags',
      'Notes',
    ];

    // CSV rows
    const rows = subscriptions.map(s => [
      s.id,
      s.vendorName,
      s.serviceName,
      s.planName || '',
      s.amount,
      s.currency,
      s.billingCycle,
      s.status,
      format(s.startDate, 'yyyy-MM-dd'),
      format(s.nextRenewalDate, 'yyyy-MM-dd'),
      s.department?.name || '',
      s.owner ? `${s.owner.firstName} ${s.owner.lastName}` : '',
      s.costCenter || '',
      s.autoRenew ? 'Yes' : 'No',
      s.tags?.join(', ') || '',
      s.notes || '',
    ]);

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  private calculateNextRenewalDate(
    startDate: Date,
    billingCycle: BillingCycle,
    customDays?: number,
  ): Date {
    const now = new Date();
    let nextDate = new Date(startDate);

    while (nextDate <= now) {
      switch (billingCycle) {
        case 'WEEKLY':
          nextDate = addWeeks(nextDate, 1);
          break;
        case 'MONTHLY':
          nextDate = addMonths(nextDate, 1);
          break;
        case 'QUARTERLY':
          nextDate = addQuarters(nextDate, 1);
          break;
        case 'ANNUAL':
          nextDate = addYears(nextDate, 1);
          break;
        case 'CUSTOM':
          if (customDays) {
            nextDate = addDays(nextDate, customDays);
          } else {
            nextDate = addMonths(nextDate, 1);
          }
          break;
        default:
          nextDate = addMonths(nextDate, 1);
      }
    }

    return nextDate;
  }

  private async createAuditLog(
    tenantId: string | null,
    userId: string,
    action: any,
    entityType: string,
    entityId: string,
    oldValues: any,
    newValues: any,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action,
          entityType,
          entityId,
          oldValues,
          newValues,
        },
      });
    } catch (error) {
      // Don't fail the main operation if audit log fails
      console.error('Failed to create audit log:', error);
    }
  }
}
