import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { AssignDeliveryManDto } from './dto/assign-delivery-man.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Roles(UserRole.CUSTOMER)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Get()
  findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.ordersService.findAll(page, limit);
  }

  @Roles(UserRole.CUSTOMER)
  @Get('my')
  findMyOrders(@CurrentUser() user: AuthUser) {
    return this.ordersService.findCustomerOrders(user.id);
  }

  @Roles(UserRole.ADMIN, UserRole.VENDOR, UserRole.DELIVERY_MAN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/assign-delivery')
  assignDeliveryMan(@Param('id') id: string, @Body() dto: AssignDeliveryManDto) {
    return this.ordersService.assignDeliveryMan(id, dto);
  }
}
