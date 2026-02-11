import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RequestWithTenant extends Request {
  tenantId?: string;
  tenantSlug?: string;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  use(req: RequestWithTenant, res: Response, next: NextFunction): void {
    // Extract tenant from various sources (in order of priority)
    // 1. Header X-Tenant-ID (for API requests)
    // 2. Subdomain (for white-label domains)
    // 3. Query parameter (for special cases)
    // 4. JWT token (set by auth guard)

    let tenantId: string | undefined;
    let tenantSlug: string | undefined;

    // Check header first
    const headerTenantId = req.headers['x-tenant-id'];
    if (headerTenantId && typeof headerTenantId === 'string') {
      tenantId = headerTenantId;
    }

    // Check subdomain (e.g., tenant1.app.example.com)
    if (!tenantId && req.headers.host) {
      const host = req.headers.host;
      const parts = host.split('.');
      // If we have more than 2 parts, the first might be a tenant slug
      // e.g., acme.app.example.com -> acme is the tenant slug
      if (parts.length > 2 && !parts[0].includes('www')) {
        tenantSlug = parts[0];
      }
    }

    // Check query parameter
    if (!tenantId && req.query.tenantId) {
      tenantId = req.query.tenantId as string;
    }

    // Attach to request
    if (tenantId) {
      req.tenantId = tenantId;
    }
    if (tenantSlug) {
      req.tenantSlug = tenantSlug;
    }

    // Log tenant resolution in debug mode
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`Tenant resolved: ${tenantId || tenantSlug || 'none'}`);
    }

    next();
  }
}
