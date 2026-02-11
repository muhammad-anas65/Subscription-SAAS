import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get(':tenantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER, UserRole.FINANCE, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get dashboard data for tenant' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved' })
  async getDashboardData(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.dashboardService.getDashboardData(tenantId, user);
  }

  @Get('trend/:tenantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get monthly spend trend' })
  @ApiQuery({ name: 'months', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Trend data retrieved' })
  async getMonthlySpendTrend(
    @Param('tenantId') tenantId: string,
    @Query('months') months: string,
    @CurrentUser() user: any,
  ) {
    return this.dashboardService.getMonthlySpendTrend(
      tenantId,
      parseInt(months) || 12,
      user,
    );
  }

  @Get('calendar/:tenantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get renewal calendar' })
  @ApiQuery({ name: 'year', required: true, type: Number })
  @ApiQuery({ name: 'month', required: true, type: Number })
  @ApiResponse({ status: 200, description: 'Calendar data retrieved' })
  async getRenewalCalendar(
    @Param('tenantId') tenantId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() user: any,
  ) {
    return this.dashboardService.getRenewalCalendar(
      tenantId,
      parseInt(year),
      parseInt(month),
      user,
    );
  }

  @Get('vendors/:tenantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get top vendors by spend' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Vendors data retrieved' })
  async getTopVendors(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit: string,
    @CurrentUser() user: any,
  ) {
    return this.dashboardService.getTopVendors(
      tenantId,
      parseInt(limit) || 10,
      user,
    );
  }
}
