import 'reflect-metadata';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { AlertsService } from './modules/alerts/alerts.service';

async function runDaily(alertsService: AlertsService, prisma: PrismaService) {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const t of tenants) {
    await alertsService.processAlertsForTenant(t.id);
  }
}

async function runMonthly(alertsService: AlertsService, prisma: PrismaService) {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const t of tenants) {
    await alertsService.sendMonthlySummary(t.id);
  }
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
  const connection = { url: redisUrl };

  const alertsService = new AlertsService(prisma);

  const queue = new Queue('alerts', {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });

  // BullMQ v5 uses repeat.pattern (cron string)
  await queue.add('daily', {}, { jobId: 'daily', repeat: { pattern: '0 9 * * *' } }); // daily 09:00
  await queue.add('monthly', {}, { jobId: 'monthly', repeat: { pattern: '0 8 1 * *' } }); // 1st monthly 08:00

  const worker = new Worker(
    'alerts',
    async (job) => {
      if (job.name === 'daily') await runDaily(alertsService, prisma);
      if (job.name === 'monthly') await runMonthly(alertsService, prisma);
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error('[alerts worker] job failed', job?.id, err?.message);
  });

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
