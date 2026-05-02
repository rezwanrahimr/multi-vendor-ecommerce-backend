import { IsOptional, IsString } from 'class-validator';

export class MarkPayoutPaidDto {
  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  adminNote?: string;
}
