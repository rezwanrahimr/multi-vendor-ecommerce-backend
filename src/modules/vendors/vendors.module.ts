import { Module } from '@nestjs/common';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminVendorsController, VendorStoreController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [NotificationsModule, AuditLogsModule],
  controllers: [VendorStoreController, AdminVendorsController],
  providers: [VendorsService, CloudinaryService],
  exports: [VendorsService],
})
export class VendorsModule {}
