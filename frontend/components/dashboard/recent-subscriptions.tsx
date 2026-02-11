'use client';

import Link from 'next/link';
import { CreditCard, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';

interface Subscription {
  id: string;
  vendorName: string;
  serviceName: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  department?: { name: string };
}

interface RecentSubscriptionsProps {
  subscriptions: Subscription[];
}

export function RecentSubscriptions({ subscriptions }: RecentSubscriptionsProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Recent Subscriptions
        </CardTitle>
        <Link href="/dashboard/subscriptions">
          <Button variant="ghost" size="sm">
            View All
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {subscriptions.length === 0 ? (
          <p className="text-gray-500 text-center py-4">
            No subscriptions yet
          </p>
        ) : (
          <div className="space-y-4">
            {subscriptions.map((subscription) => (
              <div
                key={subscription.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {subscription.vendorName}
                    </p>
                    <Badge
                      variant="secondary"
                      className={getStatusColor(subscription.status)}
                    >
                      {subscription.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500 truncate">
                    {subscription.serviceName}
                  </p>
                  {subscription.department && (
                    <p className="text-xs text-gray-400">
                      {subscription.department.name}
                    </p>
                  )}
                </div>
                <div className="text-right ml-4">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatCurrency(subscription.amount, subscription.currency)}
                  </p>
                  <p className="text-sm text-gray-400">
                    {formatDate(subscription.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
