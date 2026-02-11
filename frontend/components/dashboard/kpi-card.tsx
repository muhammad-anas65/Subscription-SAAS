'use client';

import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: number;
  trendLabel?: string;
  alert?: boolean;
}

export function KPICard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  trendLabel,
  alert,
}: KPICardProps) {
  return (
    <Card className={cn(alert && 'border-red-500 border-2')}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {title}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {value}
            </p>
            {description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {description}
              </p>
            )}
            {trend !== undefined && (
              <div className="flex items-center mt-2">
                {trend > 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
                )}
                <span
                  className={cn(
                    'text-sm font-medium',
                    trend > 0 ? 'text-green-500' : 'text-red-500'
                  )}
                >
                  {trend > 0 ? '+' : ''}
                  {trend}%
                </span>
                {trendLabel && (
                  <span className="text-sm text-gray-500 ml-1">{trendLabel}</span>
                )}
              </div>
            )}
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900 rounded-full">
            <Icon className="h-6 w-6 text-blue-500 dark:text-blue-300" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
