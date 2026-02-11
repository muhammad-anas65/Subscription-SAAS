import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UserRole, AlertRuleType, AlertChannelType, AlertStatus } from '@prisma/client';
import { addDays, format, isWithinInterval, parseISO } from 'date-fns';

export interface CreateAlertChannelDto {
  tenantId: string;
  name: string;
  type: AlertChannelType;
  webhookUrl: string;
  config?: any;
}

export interface UpdateAlertChannelDto {
  name?: string;
  webhookUrl?: string;
  isActive?: boolean;
  config?: any;
}

export interface UpdateAlertSettingsDto {
  enable14Days?: boolean;
  enable7Days?: boolean;
  enable3Days?: boolean;
  enableTomorrow?: boolean;
  enableOverdue?: boolean;
  enableMonthlySummary?: boolean;
  enableDataQuality?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone?: string;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private prisma: PrismaService) {}

  async getAlertSettings(tenantId: string, requestingUser: any) {
    if (requestingUser.role !== UserRole.SUPER_ADMIN && tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    let settings = await this.prisma.alertSettings.findUnique({
      where: { tenantId },
    });

    // Create default settings if not exists
    if (!settings) {
      settings = await this.prisma.alertSettings.create({
        data: {
          tenantId,
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
    }

    return settings;
  }

  async updateAlertSettings(
    tenantId: string,
    dto: UpdateAlertSettingsDto,
    requestingUser: any,
  ) {
    if (requestingUser.role !== UserRole.SUPER_ADMIN && tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const settings = await this.prisma.alertSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        ...dto,
      },
      update: dto,
    });

    return settings;
  }

  async getAlertChannels(tenantId: string, requestingUser: any) {
    if (requestingUser.role !== UserRole.SUPER_ADMIN && tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.alertChannel.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAlertChannel(dto: CreateAlertChannelDto, requestingUser: any) {
    if (requestingUser.role !== UserRole.SUPER_ADMIN && dto.tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const channel = await this.prisma.alertChannel.create({
      data: {
        tenantId: dto.tenantId,
        name: dto.name,
        type: dto.type,
        webhookUrl: dto.webhookUrl,
        config: dto.config || {},
        isActive: true,
      },
    });

    return channel;
  }

  async updateAlertChannel(
    id: string,
    dto: UpdateAlertChannelDto,
    requestingUser: any,
  ) {
    const channel = await this.prisma.alertChannel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Alert channel not found');
    }

    if (requestingUser.role !== UserRole.SUPER_ADMIN && channel.tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.alertChannel.update({
      where: { id },
      data: dto,
    });

    return updated;
  }

  async deleteAlertChannel(id: string, requestingUser: any) {
    const channel = await this.prisma.alertChannel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Alert channel not found');
    }

    if (requestingUser.role !== UserRole.SUPER_ADMIN && channel.tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.alertChannel.delete({
      where: { id },
    });

    return { message: 'Alert channel deleted' };
  }

  async getAlertLogs(tenantId: string, page: number, limit: number, requestingUser: any) {
    if (requestingUser.role !== UserRole.SUPER_ADMIN && tenantId !== requestingUser.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.alertLog.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          subscription: {
            select: {
              vendorName: true,
              serviceName: true,
            },
          },
        },
      }),
      this.prisma.alertLog.count({ where: { tenantId } }),
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

  // Process alerts for all tenants (called by BullMQ worker)
  async processAlertsForTenant(tenantId: string): Promise<void> {
    const settings = await this.prisma.alertSettings.findUnique({
      where: { tenantId },
    });

    if (!settings) {
      this.logger.warn(`No alert settings found for tenant ${tenantId}`);
      return;
    }

    const channels = await this.prisma.alertChannel.findMany({
      where: { tenantId, isActive: true },
    });

    if (channels.length === 0) {
      this.logger.debug(`No active alert channels for tenant ${tenantId}`);
      return;
    }

    // Check quiet hours
    if (this.isInQuietHours(settings)) {
      this.logger.debug(`Skipping alerts for tenant ${tenantId} - in quiet hours`);
      return;
    }

    const now = new Date();

    // Process each alert rule
    if (settings.enable14Days) {
      await this.processRenewalAlerts(tenantId, channels, 14, AlertRuleType.DAYS_14, now);
    }
    if (settings.enable7Days) {
      await this.processRenewalAlerts(tenantId, channels, 7, AlertRuleType.DAYS_7, now);
    }
    if (settings.enable3Days) {
      await this.processRenewalAlerts(tenantId, channels, 3, AlertRuleType.DAYS_3, now);
    }
    if (settings.enableTomorrow) {
      await this.processRenewalAlerts(tenantId, channels, 1, AlertRuleType.TOMORROW, now);
    }
    if (settings.enableOverdue) {
      await this.processOverdueAlerts(tenantId, channels, now);
    }
    if (settings.enableDataQuality) {
      await this.processDataQualityAlerts(tenantId, channels, now);
    }
  }

  private async processRenewalAlerts(
    tenantId: string,
    channels: any[],
    daysBefore: number,
    ruleType: AlertRuleType,
    now: Date,
  ): Promise<void> {
    const targetDate = addDays(now, daysBefore);
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        nextRenewalDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        department: true,
        owner: true,
      },
    });

    for (const subscription of subscriptions) {
      // Check if alert already sent for this rule and due date
      const existingAlert = await this.prisma.alertLog.findFirst({
        where: {
          tenantId,
          subscriptionId: subscription.id,
          ruleType,
          dueDate: subscription.nextRenewalDate,
          status: { in: [AlertStatus.SENT, AlertStatus.PENDING] },
        },
      });

      if (existingAlert) {
        continue; // Skip - already sent
      }

      // Send alert to all channels
      for (const channel of channels) {
        await this.sendAlert(channel, subscription, ruleType, subscription.nextRenewalDate);
      }
    }
  }

  private async processOverdueAlerts(
    tenantId: string,
    channels: any[],
    now: Date,
  ): Promise<void> {
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        nextRenewalDate: {
          lt: now,
        },
      },
      include: {
        department: true,
        owner: true,
      },
    });

    for (const subscription of subscriptions) {
      // Check if overdue alert already sent today
      const today = new Date(now.setHours(0, 0, 0, 0));
      const existingAlert = await this.prisma.alertLog.findFirst({
        where: {
          tenantId,
          subscriptionId: subscription.id,
          ruleType: AlertRuleType.OVERDUE,
          createdAt: {
            gte: today,
          },
        },
      });

      if (existingAlert) {
        continue;
      }

      for (const channel of channels) {
        await this.sendAlert(channel, subscription, AlertRuleType.OVERDUE, subscription.nextRenewalDate);
      }
    }
  }

  private async processDataQualityAlerts(
    tenantId: string,
    channels: any[],
    now: Date,
  ): Promise<void> {
    // Find subscriptions with missing critical data
    const problematicSubscriptions = await this.prisma.subscription.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        OR: [
          { ownerId: null },
          { departmentId: null },
          { costCenter: null },
        ],
      },
    });

    if (problematicSubscriptions.length === 0) {
      return;
    }

    // Only send data quality alert once per week
    const oneWeekAgo = addDays(now, -7);
    const existingAlert = await this.prisma.alertLog.findFirst({
      where: {
        tenantId,
        ruleType: AlertRuleType.DATA_QUALITY,
        createdAt: {
          gte: oneWeekAgo,
        },
      },
    });

    if (existingAlert) {
      return;
    }

    // Send summary alert
    for (const channel of channels) {
      await this.sendDataQualityAlert(channel, problematicSubscriptions);
    }
  }

  private async sendAlert(
    channel: any,
    subscription: any,
    ruleType: AlertRuleType,
    dueDate: Date,
  ): Promise<void> {
    const alertLog = await this.prisma.alertLog.create({
      data: {
        tenantId: channel.tenantId,
        subscriptionId: subscription.id,
        ruleType,
        dueDate,
        channelId: channel.id,
        status: AlertStatus.PENDING,
      },
    });

    try {
      let success = false;
      let responseCode = 0;
      let responseBody = '';

      switch (channel.type) {
        case AlertChannelType.GOOGLE_CHAT:
          const result = await this.sendGoogleChatAlert(channel, subscription, ruleType);
          success = result.success;
          responseCode = result.statusCode;
          responseBody = result.body;
          break;
        case AlertChannelType.SLACK:
          // TODO: Implement Slack webhook
          break;
        case AlertChannelType.WEBHOOK:
          // TODO: Implement generic webhook
          break;
        default:
          this.logger.warn(`Unknown channel type: ${channel.type}`);
      }

      await this.prisma.alertLog.update({
        where: { id: alertLog.id },
        data: {
          status: success ? AlertStatus.SENT : AlertStatus.FAILED,
          responseCode,
          responseBody,
          sentAt: success ? new Date() : null,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to send alert: ${error.message}`);
      
      await this.prisma.alertLog.update({
        where: { id: alertLog.id },
        data: {
          status: AlertStatus.FAILED,
          errorMessage: error.message,
        },
      });
    }
  }

  private async sendGoogleChatAlert(
    channel: any,
    subscription: any,
    ruleType: AlertRuleType,
  ): Promise<{ success: boolean; statusCode: number; body: string }> {
    const ruleTypeLabels: Record<AlertRuleType, string> = {
      [AlertRuleType.DAYS_14]: '14 days',
      [AlertRuleType.DAYS_7]: '7 days',
      [AlertRuleType.DAYS_3]: '3 days',
      [AlertRuleType.TOMORROW]: 'tomorrow',
      [AlertRuleType.OVERDUE]: 'OVERDUE',
      [AlertRuleType.MONTHLY_SUMMARY]: 'monthly summary',
      [AlertRuleType.DATA_QUALITY]: 'data quality',
    };

    const isOverdue = ruleType === AlertRuleType.OVERDUE;
    const headerText = isOverdue
      ? `⚠️ Subscription OVERDUE`
      : `⏰ Subscription Renewal Reminder`;

    const card = {
      cards: [
        {
          header: {
            title: headerText,
            subtitle: `${subscription.vendorName} - ${subscription.serviceName}`,
          },
          sections: [
            {
              widgets: [
                {
                  keyValue: {
                    topLabel: 'Renewal Date',
                    content: format(subscription.nextRenewalDate, 'MMM dd, yyyy'),
                  },
                },
                {
                  keyValue: {
                    topLabel: 'Amount',
                    content: `${subscription.amount} ${subscription.currency}`,
                  },
                },
                {
                  keyValue: {
                    topLabel: 'Billing Cycle',
                    content: subscription.billingCycle,
                  },
                },
                {
                  keyValue: {
                    topLabel: 'Department',
                    content: subscription.department?.name || 'Unassigned',
                  },
                },
                {
                  keyValue: {
                    topLabel: 'Owner',
                    content: subscription.owner
                      ? `${subscription.owner.firstName} ${subscription.owner.lastName}`
                      : 'Unassigned',
                  },
                },
              ],
            },
            {
              widgets: [
                {
                  buttons: [
                    {
                      textButton: {
                        text: 'View in SubTrack',
                        onClick: {
                          openLink: {
                            url: `${process.env.FRONTEND_URL}/subscriptions/${subscription.id}`,
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const response = await fetch(channel.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });

    const body = await response.text();

    return {
      success: response.ok,
      statusCode: response.status,
      body,
    };
  }

  private async sendDataQualityAlert(
    channel: any,
    subscriptions: any[],
  ): Promise<void> {
    const missingOwner = subscriptions.filter(s => !s.ownerId).length;
    const missingDepartment = subscriptions.filter(s => !s.departmentId).length;
    const missingCostCenter = subscriptions.filter(s => !s.costCenter).length;

    const card = {
      text: `📊 Data Quality Alert\n\n` +
        `Found ${subscriptions.length} subscriptions with missing data:\n` +
        `- Missing owner: ${missingOwner}\n` +
        `- Missing department: ${missingDepartment}\n` +
        `- Missing cost center: ${missingCostCenter}\n\n` +
        `Please review and update these subscriptions.`,
    };

    await fetch(channel.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });
  }

  private isInQuietHours(settings: any): boolean {
    if (!settings.quietHoursStart || !settings.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentTime = format(now, 'HH:mm');

    const start = settings.quietHoursStart;
    const end = settings.quietHoursEnd;

    if (start <= end) {
      return currentTime >= start && currentTime <= end;
    } else {
      // Quiet hours span midnight (e.g., 22:00 - 08:00)
      return currentTime >= start || currentTime <= end;
    }
  }

  // Send monthly summary (called on 1st of month)
  async sendMonthlySummary(tenantId: string): Promise<void> {
    const settings = await this.prisma.alertSettings.findUnique({
      where: { tenantId },
    });

    if (!settings?.enableMonthlySummary) {
      return;
    }

    const channels = await this.prisma.alertChannel.findMany({
      where: { tenantId, isActive: true },
    });

    if (channels.length === 0) {
      return;
    }

    const now = new Date();
    const lastMonth = addDays(now, -30);

    // Get monthly stats
    const stats = await this.prisma.subscription.aggregate({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      _count: { id: true },
      _sum: { amount: true },
    });

    const upcomingRenewals = await this.prisma.subscription.count({
      where: {
        tenantId,
        status: 'ACTIVE',
        nextRenewalDate: {
          gte: now,
          lte: addDays(now, 30),
        },
      },
    });

    for (const channel of channels) {
      const card = {
        text: `📅 Monthly Subscription Summary - ${format(now, 'MMMM yyyy')}\n\n` +
          `Active Subscriptions: ${stats._count.id}\n` +
          `Total Monthly Spend: $${stats._sum.amount || 0}\n` +
          `Upcoming Renewals (30 days): ${upcomingRenewals}\n\n` +
          `View details: ${process.env.FRONTEND_URL}`,
      };

      try {
        await fetch(channel.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(card),
        });
      } catch (error) {
        this.logger.error(`Failed to send monthly summary: ${error.message}`);
      }
    }
  }
}
