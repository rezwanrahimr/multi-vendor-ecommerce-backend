import { Module } from '@nestjs/common';
import {
  AdminPayoutsController,
  AdminWalletsController,
  VendorPayoutsController,
  VendorWalletController,
  WalletsController,
} from './wallets.controller';
import { WalletsService } from './wallets.service';

@Module({
  controllers: [
    WalletsController,
    VendorWalletController,
    VendorPayoutsController,
    AdminWalletsController,
    AdminPayoutsController,
  ],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
