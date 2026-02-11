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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AlertsService, CreateAlertChannelDto, UpdateAlertChannelDto, UpdateAlertSettingsDto } from './alerts.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole, AlertChannelType } from '@prisma/client';

@ApiTags('Alerts')
@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AlertsController {
  constructor(private alertsService: AlertsService) {}

  @Get('settings/:tenantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Get alert settings for tenant' })
  @ApiResponse({ status: 200, description: 'Settings retrieved' })
  async getAlertSettings(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.alertsService.getAlertSettings(tenantId, user);
  }

  @Patch('settings/:tenantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update alert settings' })
  @ApiResponse({ status: 200, description: 'Settings updated' })
  async updateAlertSettings(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateAlertSettingsDto,
    @CurrentUser() user: any,
  ) {
    return this.alertsService.updateAlertSettings(tenantId, dto, user);
  }

  @Get('channels/:tenantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Get alert channels for tenant' })
  @ApiResponse({ status: 200, description: 'Channels retrieved' })
  async getAlertChannels(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.alertsService.getAlertChannels(tenantId, user);
  }

  @Post('channels')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create alert channel' })
  @ApiResponse({ status: 201, description: 'Channel created' })
  async createAlertChannel(
    @Body() dto: CreateAlertChannelDto,
    @CurrentUser() user: any,
  ) {
    return this.alertsService.createAlertChannel(dto, user);
  }

  @Patch('channels/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update alert channel' })
  @ApiResponse({ status: 200, description: 'Channel updated' })
  async updateAlertChannel(
    @Param('id') id: string,
    @Body() dto: UpdateAlertChannelDto,
    @CurrentUser() user: any,
  ) {
    return this.alertsService.updateAlertChannel(id, dto, user);
  }

  @Delete('channels/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete alert channel' })
  @ApiResponse({ status: 200, description: 'Channel deleted' })
  async deleteAlertChannel(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.alertsService.deleteAlertChannel(id, user);
  }

  @Get('logs/:tenantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Get alert logs' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Logs retrieved' })
  async getAlertLogs(
    @Param('tenantId') tenantId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: any,
  ) {
    return this.alertsService.getAlertLogs(
      tenantId,
      parseInt(page) || 1,
      parseInt(limit) || 20,
      user,
    );
  }
}
