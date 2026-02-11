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
import { DepartmentsService, CreateDepartmentDto, UpdateDepartmentDto, DepartmentFilterDto } from './departments.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Departments')
@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DepartmentsController {
  constructor(private departmentsService: DepartmentsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get all departments' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Departments retrieved successfully' })
  async findAll(
    @Query() filters: DepartmentFilterDto,
    @CurrentUser() user: any,
  ) {
    return this.departmentsService.findAll(filters, user);
  }

  @Get('by-tenant/:tenantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get departments by tenant (simplified list)' })
  @ApiResponse({ status: 200, description: 'Departments retrieved successfully' })
  async findAllByTenant(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.departmentsService.findAllByTenant(tenantId, user);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN, UserRole.MANAGER, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get department by ID' })
  @ApiResponse({ status: 200, description: 'Department retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Department not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.departmentsService.findOne(id, user);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new department' })
  @ApiResponse({ status: 201, description: 'Department created successfully' })
  @ApiResponse({ status: 409, description: 'Department already exists' })
  async create(
    @Body() dto: CreateDepartmentDto,
    @CurrentUser() user: any,
  ) {
    return this.departmentsService.create(dto, user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update department' })
  @ApiResponse({ status: 200, description: 'Department updated successfully' })
  @ApiResponse({ status: 404, description: 'Department not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() user: any,
  ) {
    return this.departmentsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete department' })
  @ApiResponse({ status: 200, description: 'Department deleted successfully' })
  @ApiResponse({ status: 404, description: 'Department not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.departmentsService.remove(id, user);
  }
}
