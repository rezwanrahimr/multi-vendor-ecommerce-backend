import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { DeliveryService } from './delivery.service';
import { DeliveryOrderQueryDto } from './dto/delivery-order-query.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DELIVERY_MAN)
@ApiTags('Delivery')
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.deliveryService.getDashboard(user.id);
  }

  @Get('orders')
  findAssignedOrders(
    @CurrentUser() user: AuthUser,
    @Query() query: DeliveryOrderQueryDto,
  ) {
    return this.deliveryService.findAssignedOrders(user.id, query);
  }

  @Get('orders/:orderId')
  findAssignedOrder(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
  ) {
    return this.deliveryService.findAssignedOrder(user.id, orderId);
  }

  @Patch('orders/:orderId/status')
  updateDeliveryStatus(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveryService.updateDeliveryStatus(orderId, user.id, dto);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin Deliveries')
@Controller('admin/deliveries')
export class AdminDeliveriesController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get()
  findAll(@Query() query: DeliveryOrderQueryDto) {
    return this.deliveryService.findAllDeliveries(query);
  }

  @Get(':orderId')
  findOne(@Param('orderId') orderId: string) {
    return this.deliveryService.findDelivery(orderId);
  }
}
