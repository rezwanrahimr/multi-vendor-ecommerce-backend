import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';
import { SubmitManualPaymentDto } from './dto/submit-manual-payment.dto';
import { PaymentsService } from './payments.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@ApiTags('Order Payments')
@Controller('orders/:orderId')
export class OrderPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('manual-payment')
  submitManualPayment(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
    @Body() dto: SubmitManualPaymentDto,
  ) {
    return this.paymentsService.submitManualPayment(user.id, orderId, dto);
  }

  @Get('payment')
  findOrderPayment(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string) {
    return this.paymentsService.findCustomerOrderPayment(user.id, orderId);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin Payments')
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findAll(@Query() query: PaymentQueryDto) {
    return this.paymentsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Patch(':id/verify')
  verify(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.verify(id, user.id);
  }

  @Patch(':id/verify-cod')
  verifyCod(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.verify(id, user.id);
  }

  @Patch(':id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectPaymentDto,
  ) {
    return this.paymentsService.reject(id, user.id, dto);
  }

  @Patch(':id/reject-cod')
  rejectCod(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectPaymentDto,
  ) {
    return this.paymentsService.reject(id, user.id, dto);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Post('webhook')
  handleWebhook(@Body() dto: PaymentWebhookDto) {
    return this.paymentsService.handleWebhook(dto);
  }
}
