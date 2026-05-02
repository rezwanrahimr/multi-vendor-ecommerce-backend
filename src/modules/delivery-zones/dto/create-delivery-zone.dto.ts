import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateDeliveryZoneDto {
  @IsString()
  name: string;

  @IsString()
  district: string;

  @IsString()
  area: string;

  @IsNumber()
  @Min(0.01)
  baseCharge: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  sameDayCharge?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  freeDeliveryMinAmount?: number;

  @IsOptional()
  @IsString()
  estimatedDeliveryTime?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
