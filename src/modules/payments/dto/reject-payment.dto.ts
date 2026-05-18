import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';

export class RejectPaymentDto {
  @Transform(({ value, obj }) => value ?? obj.reason)
  @IsString()
  rejectionReason: string;
}
