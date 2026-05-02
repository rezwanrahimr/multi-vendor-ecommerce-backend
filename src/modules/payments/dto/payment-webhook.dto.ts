import { PaymentStatus } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class PaymentWebhookDto {
  @IsString()
  transactionId: string;

  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
