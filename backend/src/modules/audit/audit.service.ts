import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UserRole, Prisma } from '@prisma/client';

export interface AuditLogFilterDto {
  tenantId?: string;
  userId?: string;
  action?: string;
  entityType?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: AuditLogFilterDto, requestingUser: any) {
    const {
      tenantId,
      userId,
      action,
      entityType,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = filters;

    // Determine tenant scope
    let targetTenantId = tenantId;
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      targetTenantId = requestingUser.tenantId;
    }

    const where: Prisma.AuditLogWhereInput = {};

    if (targetTenantId) {
      where.tenantId = targetTenantId;
    }

    if (userId) where.userId = userId;
    if (action) where.action = action as any;
    if (entityType) where.entityType = entityType;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, requestingUser: any) {
    const log = await this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!log) {
      throw new Error('Audit log not found');
    }

    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (log.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    return log;
  }

  async getEntityHistory(entityType: string, entityId: string, requestingUser: any) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        entityType,
        entityId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Check permissions for first log
    if (logs.length > 0 && requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (logs[0].tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    return logs;
  }
}
