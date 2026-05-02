import { DeliveryStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateDeliveryStatusDto {
  @IsEnum(DeliveryStatus)
  deliveryStatus: DeliveryStatus;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  failedReason?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  cashCollectedAmount?: number;
}
