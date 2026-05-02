import { Module } from '@nestjs/common';
import {
  AdminDeliveryZonesController,
  DeliveryZonesController,
} from './delivery-zones.controller';
import { DeliveryZonesService } from './delivery-zones.service';

@Module({
  controllers: [DeliveryZonesController, AdminDeliveryZonesController],
  providers: [DeliveryZonesService],
  exports: [DeliveryZonesService],
})
export class DeliveryZonesModule {}
