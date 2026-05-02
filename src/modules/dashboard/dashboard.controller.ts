import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Dashboard')
@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Roles(UserRole.ADMIN)
  @Get('admin/dashboard')
  adminDashboard(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getAdminDashboard(query);
  }

  @Roles(UserRole.VENDOR)
  @Get('vendor/dashboard')
  vendorDashboard(@CurrentUser() user: AuthUser, @Query() query: DashboardQueryDto) {
    return this.dashboardService.getVendorDashboard(user.id, query);
  }

  @Roles(UserRole.CUSTOMER)
  @Get('customer/dashboard')
  customerDashboard(
    @CurrentUser() user: AuthUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getCustomerDashboard(user.id, query);
  }
}
