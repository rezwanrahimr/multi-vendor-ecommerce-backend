import { BadRequestException, Injectable } from '@nestjs/common';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { PrismaService } from '../../database/prisma.service';
import { CreateHomeBannerDto } from './dto/create-home-banner.dto';
import { UpdateHomeBannerDto } from './dto/update-home-banner.dto';

type UploadFile = {
  buffer: Buffer;
  mimetype?: string;
};

@Injectable()
export class HomeBannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  findAll() {
    return this.prisma.homeBanner.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.homeBanner.findUniqueOrThrow({
      where: { id },
    });
  }

  async create(dto: CreateHomeBannerDto, image?: UploadFile) {
    if (!image) {
      throw new BadRequestException('Banner image is required.');
    }

    const uploadedImage = await this.cloudinaryService.uploadImage(
      image,
      'home-banners',
    );

    try {
      return await this.prisma.homeBanner.create({
        data: {
          imageUrl: uploadedImage.secureUrl,
          imagePublicId: uploadedImage.publicId,
          redirectLink: dto.redirectLink,
        },
      });
    } catch (error) {
      await this.cloudinaryService.deleteImage(uploadedImage.publicId);
      throw error;
    }
  }

  async update(id: string, dto: UpdateHomeBannerDto, image?: UploadFile) {
    const currentBanner = await this.prisma.homeBanner.findUniqueOrThrow({
      where: { id },
      select: { imagePublicId: true },
    });

    const uploadedImage = image
      ? await this.cloudinaryService.uploadImage(image, 'home-banners')
      : undefined;

    try {
      const updatedBanner = await this.prisma.homeBanner.update({
        where: { id },
        data: {
          redirectLink: dto.redirectLink,
          imageUrl: uploadedImage?.secureUrl,
          imagePublicId: uploadedImage?.publicId,
        },
      });

      if (uploadedImage && currentBanner.imagePublicId) {
        await this.cloudinaryService.deleteImage(currentBanner.imagePublicId);
      }

      return updatedBanner;
    } catch (error) {
      if (uploadedImage?.publicId) {
        await this.cloudinaryService.deleteImage(uploadedImage.publicId);
      }

      throw error;
    }
  }

  async remove(id: string) {
    const deletedBanner = await this.prisma.homeBanner.delete({
      where: { id },
    });

    if (deletedBanner.imagePublicId) {
      await this.cloudinaryService.deleteImage(deletedBanner.imagePublicId);
    }

    return deletedBanner;
  }
}
