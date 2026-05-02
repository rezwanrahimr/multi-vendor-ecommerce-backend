import { Module } from '@nestjs/common';
import { AdminDeliveriesController, DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';

@Module({
  controllers: [DeliveryController, AdminDeliveriesController],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
