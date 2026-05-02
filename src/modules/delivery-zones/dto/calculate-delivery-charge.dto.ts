import { IsEnum, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export enum DeliveryType {
  NORMAL = 'NORMAL',
  SAME_DAY = 'SAME_DAY',
}

export class CalculateDeliveryChargeDto {
  @IsUUID()
  deliveryZoneId: string;

  @IsNumber()
  @Min(0.01)
  subtotal: number;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;
}
