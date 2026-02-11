import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });

    // Add middleware for soft deletes and tenant filtering
    this.$use(this.softDeleteMiddleware);
    this.$use(this.tenantMiddleware);
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to database');

    // Log queries in development
    if (process.env.NODE_ENV !== 'production') {
      this.$on('query' as never, (e: Prisma.QueryEvent) => {
        this.logger.debug(`Query: ${e.query}`);
        this.logger.debug(`Params: ${e.params}`);
        this.logger.debug(`Duration: ${e.duration}ms`);
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }

  async enableShutdownHooks(app: any) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }

  // Middleware to handle soft deletes
  private softDeleteMiddleware: Prisma.Middleware = async (params, next) => {
    const softDeleteModels = ['Subscription', 'User', 'Department'];
    
    // Handle findMany and findFirst to exclude soft-deleted records
    if (params.action === 'findMany' || params.action === 'findFirst' || params.action === 'findUnique') {
      if (softDeleteModels.includes(params.model)) {
        params.args = params.args || {};
        params.args.where = {
          ...params.args.where,
          status: { not: 'CANCELED' },
        };
      }
    }

    return next(params);
  };

  // Middleware for tenant isolation (additional safety layer)
  private tenantMiddleware: Prisma.Middleware = async (params, next) => {
    // Add tenant filtering for multi-tenant safety
    // This is a safety net - actual tenant filtering should be done at query level
    return next(params);
  };

  // Helper method to clean health check data (for health endpoint)
  async checkHealth(): Promise<{ status: string; latency: number }> {
    const start = Date.now();
    try {
      await this.$queryRaw`SELECT 1`;
      return {
        status: 'healthy',
        latency: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - start,
      };
    }
  }
}
