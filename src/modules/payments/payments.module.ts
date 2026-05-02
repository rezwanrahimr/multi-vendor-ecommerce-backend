import { Module } from '@nestjs/common';
import {
  AdminPaymentsController,
  OrderPaymentsController,
  PaymentsController,
} from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController, OrderPaymentsController, AdminPaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
