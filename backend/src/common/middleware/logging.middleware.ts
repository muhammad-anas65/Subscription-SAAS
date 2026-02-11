import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Request');

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    
    // Capture response finish
    res.on('finish', () => {
      const duration = Date.now() - start;
      const { method, originalUrl } = req;
      const statusCode = res.statusCode;
      
      // Get real client IP (Cloudflare aware)
      const clientIp = this.getClientIp(req);
      
      const logMessage = `${method} ${originalUrl} ${statusCode} - ${duration}ms - ${clientIp}`;
      
      if (statusCode >= 500) {
        this.logger.error(logMessage);
      } else if (statusCode >= 400) {
        this.logger.warn(logMessage);
      } else {
        this.logger.log(logMessage);
      }
    });

    next();
  }

  private getClientIp(req: Request): string {
    // Cloudflare connecting IP (most reliable when behind Cloudflare)
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) return Array.isArray(cfIp) ? cfIp[0] : cfIp;

    // Standard forwarded headers
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = typeof forwarded === 'string' ? forwarded : forwarded[0];
      return ips.split(',')[0].trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) return Array.isArray(realIp) ? realIp[0] : realIp;

    return req.ip || 'unknown';
  }
}
