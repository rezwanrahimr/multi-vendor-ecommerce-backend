import { Module } from '@nestjs/common';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { AdminCategoriesController, CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService, CloudinaryService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
