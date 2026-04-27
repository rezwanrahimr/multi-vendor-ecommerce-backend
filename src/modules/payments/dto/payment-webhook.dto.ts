import { PaymentStatus } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class PaymentWebhookDto {
  @IsString()
  transactionId: string;

  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
