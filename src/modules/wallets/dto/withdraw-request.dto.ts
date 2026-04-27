import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class WithdrawRequestDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  paymentMethod: string;

  @IsString()
  accountNumber: string;

  @IsOptional()
  @IsString()
  note?: string;
}
