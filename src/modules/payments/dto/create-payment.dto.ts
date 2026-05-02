import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  orderId: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsString()
  senderPhone?: string;

  @IsOptional()
  @IsString()
  paymentScreenshotUrl?: string;

  @IsOptional()
  @IsString()
  paymentScreenshotPublicId?: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
