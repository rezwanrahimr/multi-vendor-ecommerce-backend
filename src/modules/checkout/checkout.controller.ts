import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { CheckoutService } from './checkout.service';
import { CalculateCheckoutDto } from './dto/calculate-checkout.dto';
import { ValidateCouponDto } from '../coupons/dto/validate-coupon.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@ApiTags('Checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('calculate')
  calculate(@CurrentUser() user: AuthUser, @Body() dto: CalculateCheckoutDto) {
    return this.checkoutService.calculate(user.id, dto);
  }

  @Post('validate-coupon')
  validateCoupon(@CurrentUser() user: AuthUser, @Body() dto: ValidateCouponDto) {
    return this.checkoutService.validateCoupon(user.id, dto);
  }
}
