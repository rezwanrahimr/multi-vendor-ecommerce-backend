import { Module } from '@nestjs/common';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import {
  AdminProductsController,
  ProductsController,
  VendorProductsController,
} from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [
    ProductsController,
    VendorProductsController,
    AdminProductsController,
  ],
  providers: [ProductsService, CloudinaryService],
  exports: [ProductsService],
})
export class ProductsModule {}
