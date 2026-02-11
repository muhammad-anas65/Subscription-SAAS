'use client';

import Link from 'next/link';
import { Calendar, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate, formatRelativeDate } from '@/lib/utils';

interface Renewal {
  id: string;
  vendorName: string;
  serviceName: string;
  amount: number;
  currency: string;
  nextRenewalDate: string;
  department?: { name: string };
}

interface UpcomingRenewalsProps {
  renewals: Renewal[];
}

export function UpcomingRenewals({ renewals }: UpcomingRenewalsProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Upcoming Renewals
        </CardTitle>
        <Link href="/dashboard/subscriptions">
          <Button variant="ghost" size="sm">
            View All
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {renewals.length === 0 ? (
          <p className="text-gray-500 text-center py-4">
            No upcoming renewals in the next 30 days
          </p>
        ) : (
          <div className="space-y-4">
            {renewals.slice(0, 5).map((renewal) => (
              <div
                key={renewal.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {renewal.vendorName}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {renewal.serviceName}
                  </p>
                  {renewal.department && (
                    <p className="text-xs text-gray-400">
                      {renewal.department.name}
                    </p>
                  )}
                </div>
                <div className="text-right ml-4">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatCurrency(renewal.amount, renewal.currency)}
                  </p>
                  <p className="text-sm text-blue-500">
                    {formatRelativeDate(renewal.nextRenewalDate)}
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
