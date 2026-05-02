import { IsString } from 'class-validator';
import { CalculateCheckoutDto } from '../../checkout/dto/calculate-checkout.dto';

export class ValidateCouponDto extends CalculateCheckoutDto {
  @IsString()
  couponCode: string;
}
