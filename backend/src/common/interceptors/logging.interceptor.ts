import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();
    const handlerName = context.getHandler().name;
    const className = context.getClass().name;
    
    const startTime = Date.now();
    const { method, url, ip, headers } = request;
    const userAgent = headers['user-agent'] || 'unknown';
    const tenantId = headers['x-tenant-id'] || 'none';
    const userId = (request as any).user?.userId || 'anonymous';

    // Skip health checks in logs
    if (url.includes('/health')) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;
          
          const logData = {
            method,
            url,
            statusCode,
            duration: `${duration}ms`,
            ip: this.getClientIp(request),
            userAgent,
            tenantId,
            userId,
            handler: `${className}.${handlerName}`,
          };

          if (statusCode >= 400) {
            this.logger.warn(JSON.stringify(logData));
          } else {
            this.logger.log(JSON.stringify(logData));
          }
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;
          
          const logData = {
            method,
            url,
            statusCode,
            duration: `${duration}ms`,
            ip: this.getClientIp(request),
            userAgent,
            tenantId,
            userId,
            handler: `${className}.${handlerName}`,
            error: error.message,
          };

          this.logger.error(JSON.stringify(logData));
        },
      }),
    );
  }

  private getClientIp(request: Request): string {
    // Cloudflare headers
    const cfConnectingIp = request.headers['cf-connecting-ip'];
    if (cfConnectingIp) {
      return Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
    }

    // Standard forwarded headers
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor) 
        ? forwardedFor[0] 
        : forwardedFor.split(',')[0].trim();
      return ips;
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return request.ip || 'unknown';
  }
}
