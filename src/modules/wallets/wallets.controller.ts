import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { CreatePayoutRequestDto } from './dto/create-payout-request.dto';
import { MarkPayoutPaidDto } from './dto/mark-payout-paid.dto';
import { PayoutQueryDto } from './dto/payout-query.dto';
import { RejectPayoutDto } from './dto/reject-payout.dto';
import { WalletQueryDto } from './dto/wallet-query.dto';
import { WalletTransactionQueryDto } from './dto/wallet-transaction-query.dto';
import { WalletsService } from './wallets.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
@ApiTags('Vendor Wallet')
@Controller('vendor/wallet')
export class VendorWalletController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  findMyWallet(@CurrentUser() user: AuthUser) {
    return this.walletsService.findVendorWallet(user.id);
  }

  @Get('transactions')
  findMyTransactions(
    @CurrentUser() user: AuthUser,
    @Query() query: WalletTransactionQueryDto,
  ) {
    return this.walletsService.findVendorTransactions(user.id, query);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
@ApiTags('Vendor Payouts')
@Controller('vendor/payouts')
export class VendorPayoutsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  requestPayout(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePayoutRequestDto,
  ) {
    return this.walletsService.requestPayout(user.id, dto);
  }

  @Get()
  findMyPayouts(@CurrentUser() user: AuthUser, @Query() query: PayoutQueryDto) {
    return this.walletsService.findVendorPayouts(user.id, query);
  }

  @Get(':id')
  findMyPayout(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.walletsService.findVendorPayout(user.id, id);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin Wallets')
@Controller('admin/wallets')
export class AdminWalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  findAll(@Query() query: WalletQueryDto) {
    return this.walletsService.findAllWallets(query);
  }

  @Get(':vendorId')
  findOne(@Param('vendorId') vendorId: string) {
    return this.walletsService.findAdminWallet(vendorId);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin Payouts')
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  findAll(@Query() query: PayoutQueryDto) {
    return this.walletsService.findAllPayouts(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.walletsService.findPayout(id);
  }

  @Patch(':id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.walletsService.approvePayout(id, user.id);
  }

  @Patch(':id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectPayoutDto,
  ) {
    return this.walletsService.rejectPayout(id, user.id, dto);
  }

  @Patch(':id/mark-paid')
  markPaid(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MarkPayoutPaidDto,
  ) {
    return this.walletsService.markPayoutPaid(id, user.id, dto);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Wallets')
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Roles(UserRole.VENDOR)
  @Get('me')
  findMyWallet(@CurrentUser() user: AuthUser) {
    return this.walletsService.findVendorWallet(user.id);
  }
}
