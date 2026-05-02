import { Module } from '@nestjs/common';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  AdminProductsController,
  ProductsController,
  VendorProductsController,
} from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [NotificationsModule, AuditLogsModule],
  controllers: [
    ProductsController,
    VendorProductsController,
    AdminProductsController,
  ],
  providers: [ProductsService, CloudinaryService],
  exports: [ProductsService],
})
export class ProductsModule {}
