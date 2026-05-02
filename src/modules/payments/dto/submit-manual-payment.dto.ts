import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SubmitManualPaymentDto {
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsString()
  transactionId: string;

  @IsString()
  senderPhone: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  paymentScreenshotUrl?: string;

  @IsOptional()
  @IsString()
  paymentScreenshotPublicId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
