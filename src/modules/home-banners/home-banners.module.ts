import { Module } from '@nestjs/common';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { HomeBannersController } from './home-banners.controller';
import { HomeBannersService } from './home-banners.service';

@Module({
  controllers: [HomeBannersController],
  providers: [HomeBannersService, CloudinaryService],
  exports: [HomeBannersService],
})
export class HomeBannersModule {}
