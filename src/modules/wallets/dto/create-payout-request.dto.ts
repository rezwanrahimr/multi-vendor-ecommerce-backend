import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePayoutRequestDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  method: string;

  @IsString()
  accountNumber: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
