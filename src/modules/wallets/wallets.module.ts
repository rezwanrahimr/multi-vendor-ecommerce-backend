import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  AdminPayoutsController,
  AdminWalletsController,
  VendorPayoutsController,
  VendorWalletController,
  WalletsController,
} from './wallets.controller';
import { WalletsService } from './wallets.service';

@Module({
  imports: [NotificationsModule, AuditLogsModule],
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
