import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { DeliveryZonesModule } from '../delivery-zones/delivery-zones.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [DeliveryZonesModule, CommissionsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
