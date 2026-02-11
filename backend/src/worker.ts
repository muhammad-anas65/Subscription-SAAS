import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const logger = new Logger('Worker');

// Initialize Prisma
const prisma = new PrismaClient();

// Redis connection
let redis: IORedis;
let alertQueue: Queue;
let alertWorker: Worker;

async function bootstrap() {
  logger.log('Starting SubTrack Worker...');

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  // Create Redis connection
  redis = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  redis.on('connect', () => {
    logger.log('Connected to Redis');
  });

  redis.on('error', (err) => {
    logger.error('Redis error:', err);
  });

  // Create queue
  alertQueue = new Queue('alerts', {
    connection: redis,
  });

  // Create worker
  alertWorker = new Worker(
    'alerts',
    async (job: Job) => {
      logger.log(`Processing job ${job.id}: ${job.name}`);
      
      try {
        switch (job.name) {
          case 'process-alerts':
            await processAlerts(job.data.tenantId);
            break;
          case 'monthly-summary':
            await sendMonthlySummary(job.data.tenantId);
            break;
          default:
            logger.warn(`Unknown job type: ${job.name}`);
        }
      } catch (error) {
        logger.error(`Job ${job.id} failed:`, error);
        throw error;
      }
    },
    {
      connection: redis,
      concurrency: 5,
    },
  );

  alertWorker.on('completed', (job) => {
    logger.log(`Job ${job.id} completed`);
  });

  alertWorker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed:`, err);
  });

  // Schedule recurring jobs
  await scheduleRecurringJobs();

  logger.log('Worker started successfully');
}

async function processAlerts(tenantId: string) {
  // Import alerts service dynamically
  const { AlertsService } = await import('./modules/alerts/alerts.service');
  
  // Create a minimal alerts service instance
  const alertsService = new AlertsService(prisma);
  
  await alertsService.processAlertsForTenant(tenantId);
}

async function sendMonthlySummary(tenantId: string) {
  const { AlertsService } = await import('./modules/alerts/alerts.service');
  const alertsService = new AlertsService(prisma);
  
  await alertsService.sendMonthlySummary(tenantId);
}

async function scheduleRecurringJobs() {
  // Get all active tenants
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
  });

  for (const tenant of tenants) {
    // Schedule daily alert processing at 9 AM
    await alertQueue.add(
      'process-alerts',
      { tenantId: tenant.id },
      {
        repeat: {
          cron: '0 9 * * *', // Every day at 9 AM
        },
        jobId: `daily-alerts-${tenant.id}`,
      },
    );

    // Schedule monthly summary on 1st of month at 8 AM
    await alertQueue.add(
      'monthly-summary',
      { tenantId: tenant.id },
      {
        repeat: {
          cron: '0 8 1 * *', // 1st of every month at 8 AM
        },
        jobId: `monthly-summary-${tenant.id}`,
      },
    );

    logger.log(`Scheduled jobs for tenant: ${tenant.name}`);
  }
}

// Graceful shutdown
async function shutdown() {
  logger.log('Shutting down worker...');
  
  await alertWorker?.close();
  await alertQueue?.close();
  await redis?.quit();
  await prisma.$disconnect();
  
  logger.log('Worker shut down successfully');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

bootstrap().catch((error) => {
  logger.error('Failed to start worker:', error);
  process.exit(1);
});
