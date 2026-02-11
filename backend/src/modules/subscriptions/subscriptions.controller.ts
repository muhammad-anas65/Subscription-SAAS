import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SubscriptionsService, CreateSubscriptionDto, UpdateSubscriptionDto, SubscriptionFilterDto } from './subscriptions.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole, SubscriptionStatus, BillingCycle } from '@prisma/client';

@ApiTags('Subscriptions')
@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SubscriptionsController {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER, UserRole.FINANCE, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get all subscriptions' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: SubscriptionStatus })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'billingCycle', required: false, enum: BillingCycle })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'upcomingDays', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Subscriptions retrieved successfully' })
  async findAll(
    @Query() filters: SubscriptionFilterDto,
    @CurrentUser() user: any,
  ) {
    return this.subscriptionsService.findAll(filters, user);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER, UserRole.FINANCE, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get subscription by ID' })
  @ApiResponse({ status: 200, description: 'Subscription retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.subscriptionsService.findOne(id, user);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new subscription' })
  @ApiResponse({ status: 201, description: 'Subscription created successfully' })
  async create(
    @Body() dto: CreateSubscriptionDto,
    @CurrentUser() user: any,
  ) {
    return this.subscriptionsService.create(dto, user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update subscription' })
  @ApiResponse({ status: 200, description: 'Subscription updated successfully' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser() user: any,
  ) {
    return this.subscriptionsService.update(id, dto, user);
  }

  @Post(':id/cancel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel subscription' })
  @ApiResponse({ status: 200, description: 'Subscription canceled successfully' })
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.subscriptionsService.cancel(id, user);
  }

  @Post(':id/pause')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause subscription' })
  @ApiResponse({ status: 200, description: 'Subscription paused successfully' })
  async pause(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.subscriptionsService.pause(id, user);
  }

  @Post(':id/resume')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume subscription' })
  @ApiResponse({ status: 200, description: 'Subscription resumed successfully' })
  async resume(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.subscriptionsService.resume(id, user);
  }

  @Post(':id/duplicate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Duplicate subscription' })
  @ApiResponse({ status: 201, description: 'Subscription duplicated successfully' })
  async duplicate(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.subscriptionsService.duplicate(id, user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete subscription' })
  @ApiResponse({ status: 200, description: 'Subscription deleted successfully' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.subscriptionsService.remove(id, user);
  }

  @Get('upcoming/:tenantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get upcoming renewals for tenant' })
  @ApiResponse({ status: 200, description: 'Upcoming renewals retrieved' })
  async getUpcomingRenewals(
    @Param('tenantId') tenantId: string,
    @Query('days') days: string,
    @CurrentUser() user: any,
  ) {
    return this.subscriptionsService.getUpcomingRenewals(
      tenantId,
      parseInt(days) || 30,
      user,
    );
  }

  @Get('stats/:tenantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get subscription statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved' })
  async getStats(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.subscriptionsService.getStats(tenantId, user);
  }

  @Get('export/:tenantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Export subscriptions to CSV' })
  @ApiResponse({ status: 200, description: 'CSV exported successfully' })
  async exportToCsv(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const csv = await this.subscriptionsService.exportToCsv(tenantId, user);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="subscriptions-${tenantId}-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  }
}
