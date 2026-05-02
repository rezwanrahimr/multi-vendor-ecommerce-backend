import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { DeliveryZonesModule } from '../delivery-zones/delivery-zones.module';
import { PaymentsModule } from '../payments/payments.module';
import { WalletsModule } from '../wallets/wallets.module';
import {
  AdminOrdersController,
  OrdersController,
  VendorOrdersController,
} from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [DeliveryZonesModule, CommissionsModule, PaymentsModule, WalletsModule],
  controllers: [OrdersController, VendorOrdersController, AdminOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
