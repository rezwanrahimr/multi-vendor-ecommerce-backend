import { IsString } from 'class-validator';

export class RejectPaymentDto {
  @IsString()
  rejectionReason: string;
}
