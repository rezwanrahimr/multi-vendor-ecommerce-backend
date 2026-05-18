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
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { PaymentsService } from '../payments/payments.service';
import {AdminOrderQueryDto} from './dto/admin-order-query.dto';
import { WalletsService } from '../wallets/wallets.service';
import { AssignDeliveryManDto } from './dto/assign-delivery-man.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Roles(UserRole.CUSTOMER)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.id, dto);
  }

  @Roles(UserRole.CUSTOMER)
  @Get()
  findMyOrders(@CurrentUser() user: AuthUser) {
    return this.ordersService.findCustomerOrders(user.id);
  }

  @Roles(UserRole.CUSTOMER)
  @Get(':id')
  findMyOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.findCustomerOrder(user.id, id);
  }

  @Roles(UserRole.CUSTOMER)
  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.cancelCustomerOrder(user.id, id);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
@ApiTags('Vendor Orders')
@Controller('vendor/orders')
export class VendorOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findMine(@CurrentUser() user: AuthUser) {
    return this.ordersService.findVendorOrders(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.findVendorOrder(user.id, id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateVendorStatus(user.id, id, dto);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin Orders')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly walletsService: WalletsService,
  ) {}

  @Get()
  findAll(@Query() query: AdminOrderQueryDto) {
    return this.ordersService.findAll(query);
  }

  @Get('stats/summary')
  summary(@Query() query: AdminOrderQueryDto) {
    return this.ordersService.getAdminSummary(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto, user.id);
  }

  @Patch(':id/assign-delivery')
  assignDeliveryMan(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignDeliveryManDto,
  ) {
    return this.ordersService.assignDeliveryMan(id, dto, user.id);
  }

  @Patch(':id/verify-cod-payment')
  verifyCodPayment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.verifyCodByOrder(id, user.id);
  }

  @Post(':id/settle-wallet')
  settleWallet(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.walletsService.settleOrderVendorEarnings(id, user.id);
  }
}
