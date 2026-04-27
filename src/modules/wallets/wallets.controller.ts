import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { WalletsService } from './wallets.service';
import { WithdrawRequestDto } from './dto/withdraw-request.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Roles(UserRole.VENDOR)
  @Get('me')
  findMyWallet(@CurrentUser() user: AuthUser) {
    return this.walletsService.findVendorWallet(user.id);
  }

  @Roles(UserRole.ADMIN)
  @Get()
  findAll() {
    return this.walletsService.findAll();
  }

  @Roles(UserRole.VENDOR)
  @Post('withdrawals')
  requestWithdrawal(@CurrentUser() user: AuthUser, @Body() dto: WithdrawRequestDto) {
    return this.walletsService.requestWithdrawal(user.id, dto);
  }
}
