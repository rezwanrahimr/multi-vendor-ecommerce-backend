import { WalletTransactionType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export class WalletTransactionQueryDto {
  @IsOptional()
  @IsEnum(WalletTransactionType)
  type?: WalletTransactionType;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}
