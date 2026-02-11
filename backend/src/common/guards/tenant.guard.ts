import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const requestedTenantId = request.params.tenantId || request.body.tenantId || request.query.tenantId;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // SUPER_ADMIN can access any tenant
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    // User must have a tenant assigned
    if (!user.tenantId) {
      throw new ForbiddenException('User not assigned to any tenant');
    }

    // If a specific tenant is requested, verify it matches user's tenant
    if (requestedTenantId && requestedTenantId !== user.tenantId) {
      throw new ForbiddenException('Access denied to this tenant');
    }

    // Set tenant ID in request for downstream use
    request.tenantId = user.tenantId;

    return true;
  }
}
