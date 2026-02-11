import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UserRole, SubscriptionStatus } from '@prisma/client';
import { addDays, startOfMonth, endOfMonth, format, subMonths, eachMonthOfInterval } from 'date-fns';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardData(tenantId: string, requestingUser: any) {
    if (requestingUser.role !== UserRole.SUPER_ADMIN && tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const now = new Date();
    const thirtyDaysFromNow = addDays(now, 30);
    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);

    const [
      totalSubscriptions,
      activeSubscriptions,
      monthlySpend,
      upcomingRenewals,
      recentSubscriptions,
      expiringSoon,
      byStatus,
      byDepartment,
    ] = await Promise.all([
      // Total subscriptions
      this.prisma.subscription.count({
        where: { tenantId },
      }),

      // Active subscriptions
      this.prisma.subscription.count({
        where: { tenantId, status: 'ACTIVE' },
      }),

      // Monthly spend (monthly + annual/12)
      this.prisma.subscription.aggregate({
        where: {
          tenantId,
          status: 'ACTIVE',
        },
        _sum: { amount: true },
      }),

      // Upcoming renewals (next 30 days)
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

      // Recent subscriptions
      this.prisma.subscription.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          department: {
            select: { name: true },
          },
        },
      }),

      // Expiring soon (next 7 days)
      this.prisma.subscription.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          nextRenewalDate: {
            gte: now,
            lte: addDays(now, 7),
          },
        },
        orderBy: { nextRenewalDate: 'asc' },
        take: 5,
        include: {
          department: {
            select: { name: true },
          },
          owner: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),

      // By status
      this.prisma.subscription.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { id: true },
      }),

      // By department
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

    // Calculate estimated monthly spend
    const monthlySubscriptions = await this.prisma.subscription.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      select: {
        amount: true,
        billingCycle: true,
      },
    });

    let estimatedMonthlySpend = 0;
    monthlySubscriptions.forEach(sub => {
      switch (sub.billingCycle) {
        case 'MONTHLY':
          estimatedMonthlySpend += Number(sub.amount);
          break;
        case 'QUARTERLY':
          estimatedMonthlySpend += Number(sub.amount) / 3;
          break;
        case 'ANNUAL':
          estimatedMonthlySpend += Number(sub.amount) / 12;
          break;
        case 'WEEKLY':
          estimatedMonthlySpend += Number(sub.amount) * 4.33;
          break;
        case 'CUSTOM':
          estimatedMonthlySpend += Number(sub.amount);
          break;
      }
    });

    return {
      summary: {
        totalSubscriptions,
        activeSubscriptions,
        estimatedMonthlySpend: Math.round(estimatedMonthlySpend * 100) / 100,
        upcomingRenewals,
      },
      byStatus: byStatus.map(s => ({
        status: s.status,
        count: s._count.id,
      })),
      byDepartment: byDepartment.map(d => ({
        departmentId: d.departmentId,
        departmentName: d.departmentId ? departmentMap.get(d.departmentId) : 'Unassigned',
        count: d._count.id,
        totalAmount: d._sum.amount || 0,
      })),
      recentSubscriptions,
      expiringSoon,
    };
  }

  async getMonthlySpendTrend(tenantId: string, months: number, requestingUser: any) {
    if (requestingUser.role !== UserRole.SUPER_ADMIN && tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const now = new Date();
    const startDate = subMonths(now, months - 1);
    
    const monthIntervals = eachMonthOfInterval({
      start: startOfMonth(startDate),
      end: endOfMonth(now),
    });

    const trend = await Promise.all(
      monthIntervals.map(async (month) => {
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);

        // Get subscriptions that were active during this month
        const subscriptions = await this.prisma.subscription.findMany({
          where: {
            tenantId,
            status: 'ACTIVE',
            startDate: {
              lte: monthEnd,
            },
            OR: [
              { endDate: null },
              { endDate: { gte: monthStart } },
            ],
          },
          select: {
            amount: true,
            billingCycle: true,
          },
        });

        let monthlyTotal = 0;
        subscriptions.forEach(sub => {
          switch (sub.billingCycle) {
            case 'MONTHLY':
              monthlyTotal += Number(sub.amount);
              break;
            case 'QUARTERLY':
              monthlyTotal += Number(sub.amount) / 3;
              break;
            case 'ANNUAL':
              monthlyTotal += Number(sub.amount) / 12;
              break;
            case 'WEEKLY':
              monthlyTotal += Number(sub.amount) * 4.33;
              break;
          }
        });

        return {
          month: format(month, 'yyyy-MM'),
          monthName: format(month, 'MMM yyyy'),
          amount: Math.round(monthlyTotal * 100) / 100,
        };
      }),
    );

    return trend;
  }

  async getRenewalCalendar(tenantId: string, year: number, month: number, requestingUser: any) {
    if (requestingUser.role !== UserRole.SUPER_ADMIN && tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const renewals = await this.prisma.subscription.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        nextRenewalDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { nextRenewalDate: 'asc' },
      select: {
        id: true,
        vendorName: true,
        serviceName: true,
        amount: true,
        currency: true,
        nextRenewalDate: true,
        department: {
          select: { name: true },
        },
      },
    });

    // Group by day
    const groupedByDay: Record<number, typeof renewals> = {};
    renewals.forEach(renewal => {
      const day = renewal.nextRenewalDate.getDate();
      if (!groupedByDay[day]) {
        groupedByDay[day] = [];
      }
      groupedByDay[day].push(renewal);
    });

    return {
      year,
      month,
      totalRenewals: renewals.length,
      totalAmount: renewals.reduce((sum, r) => sum + Number(r.amount), 0),
      byDay: groupedByDay,
    };
  }

  async getTopVendors(tenantId: string, limit: number, requestingUser: any) {
    if (requestingUser.role !== UserRole.SUPER_ADMIN && tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const vendors = await this.prisma.subscription.groupBy({
      by: ['vendorName'],
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      _count: { id: true },
      _sum: { amount: true },
      orderBy: {
        _sum: { amount: 'desc' },
      },
      take: limit,
    });

    return vendors.map(v => ({
      vendorName: v.vendorName,
      subscriptionCount: v._count.id,
      totalSpend: v._sum.amount || 0,
    }));
  }
}
