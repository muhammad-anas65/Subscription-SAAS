'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { dashboardApi, subscriptionsApi } from '@/lib/api';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KPICard } from '@/components/dashboard/kpi-card';
import { SpendChart } from '@/components/dashboard/spend-chart';
import { StatusChart } from '@/components/dashboard/status-chart';
import { UpcomingRenewals } from '@/components/dashboard/upcoming-renewals';
import { RecentSubscriptions } from '@/components/dashboard/recent-subscriptions';
import { Loader2, CreditCard, TrendingUp, Calendar, AlertCircle } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const tenantId = user?.tenantId;

  const { data: dashboardData, isLoading: isDashboardLoading } = useQuery({
    queryKey: ['dashboard', tenantId],
    queryFn: () => dashboardApi.getDashboard(tenantId!).then((res) => res.data),
    enabled: !!tenantId,
  });

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['subscription-stats', tenantId],
    queryFn: () => subscriptionsApi.getStats(tenantId!).then((res) => res.data),
    enabled: !!tenantId,
  });

  const { data: upcomingRenewals, isLoading: isUpcomingLoading } = useQuery({
    queryKey: ['upcoming-renewals', tenantId],
    queryFn: () =>
      subscriptionsApi.getUpcoming(tenantId!, 30).then((res) => res.data),
    enabled: !!tenantId,
  });

  const isLoading = isDashboardLoading || isStatsLoading || isUpcomingLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const summary = dashboardData?.summary;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Overview of your subscription portfolio
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Subscriptions"
          value={summary?.totalSubscriptions || 0}
          icon={CreditCard}
          trend={+5}
          trendLabel="vs last month"
        />
        <KPICard
          title="Active Subscriptions"
          value={summary?.activeSubscriptions || 0}
          icon={TrendingUp}
          description={`${Math.round(
            ((summary?.activeSubscriptions || 0) /
              (summary?.totalSubscriptions || 1)) *
              100
          )}% of total`}
        />
        <KPICard
          title="Monthly Spend"
          value={formatCurrency(summary?.estimatedMonthlySpend || 0)}
          icon={Calendar}
          trend={-2}
          trendLabel="vs last month"
        />
        <KPICard
          title="Upcoming Renewals"
          value={summary?.upcomingRenewals || 0}
          icon={AlertCircle}
          description="Next 30 days"
          alert={summary?.upcomingRenewals > 5}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Spend Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendChart tenantId={tenantId!} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscription Status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusChart data={dashboardData?.byStatus || []} />
          </CardContent>
        </Card>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UpcomingRenewals renewals={upcomingRenewals || []} />
        <RecentSubscriptions subscriptions={dashboardData?.recentSubscriptions || []} />
      </div>
    </div>
  );
}
