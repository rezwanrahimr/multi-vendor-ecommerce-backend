import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { DeliveryService } from './delivery.service';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DELIVERY_MAN)
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('orders')
  findAssignedOrders(@CurrentUser() user: AuthUser) {
    return this.deliveryService.findAssignedOrders(user.id);
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
