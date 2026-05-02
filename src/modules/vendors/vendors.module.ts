import { Module } from '@nestjs/common';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { AdminVendorsController, VendorStoreController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  controllers: [VendorStoreController, AdminVendorsController],
  providers: [VendorsService, CloudinaryService],
  exports: [VendorsService],
})
export class VendorsModule {}
