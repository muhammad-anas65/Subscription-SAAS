'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { getStatusColor } from '@/lib/utils';

interface StatusChartProps {
  data: { status: string; count: number }[];
}

const COLORS: Record<string, string> = {
  ACTIVE: '#22c55e',
  CANCELED: '#ef4444',
  PAUSED: '#eab308',
  TRIAL: '#3b82f6',
  EXPIRED: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  CANCELED: 'Canceled',
  PAUSED: 'Paused',
  TRIAL: 'Trial',
  EXPIRED: 'Expired',
};

export function StatusChart({ data }: StatusChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available
      </div>
    );
  }

  const chartData = data.map((item) => ({
    name: STATUS_LABELS[item.status] || item.status,
    value: item.count,
    color: COLORS[item.status] || '#6b7280',
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-white dark:bg-gray-800 p-3 border rounded-lg shadow-lg">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {data.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      Count: {data.value}
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            formatter={(value) => (
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {value}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
