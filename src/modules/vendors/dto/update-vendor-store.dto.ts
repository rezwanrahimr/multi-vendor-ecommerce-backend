import { Transform } from 'class-transformer';
import { IsObject, IsOptional, IsPhoneNumber, IsString, MaxLength } from 'class-validator';

export class UpdateVendorStoreDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return value;
    }
  })
  @IsObject()
  address?: Record<string, unknown>;
}
