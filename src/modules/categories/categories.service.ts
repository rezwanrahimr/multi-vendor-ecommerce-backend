import { Injectable } from '@nestjs/common';
import { CategoryStatus } from '@prisma/client';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { PrismaService } from '../../database/prisma.service';
import { createSlug } from '../../utils/slug.util';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

type UploadFile = {
  buffer: Buffer;
  mimetype?: string;
};

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(dto: CreateCategoryDto, image?: UploadFile) {
    const uploadedImage = image
      ? await this.cloudinaryService.uploadImage(image, 'categories')
      : undefined;

    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name,
          slug: dto.slug ?? createSlug(dto.name),
          description: dto.description,
          parentId: dto.parentId,
          status: dto.status,
          imageUrl: uploadedImage?.secureUrl,
          imagePublicId: uploadedImage?.publicId,
        },
      });
    } catch (error) {
      if (uploadedImage?.publicId) {
        await this.cloudinaryService.deleteImage(uploadedImage.publicId);
      }

      throw error;
    }
  }

  findAll() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        children: true,
        _count: {
          select: { products: true },
        },
      },
    });
  }

  findPublicAll() {
    return this.prisma.category.findMany({
      where: { status: CategoryStatus.ACTIVE },
      orderBy: { name: 'asc' },
      include: {
        children: {
          where: { status: CategoryStatus.ACTIVE },
        },
        _count: {
          select: { products: true },
        },
      },
    });
  }

  findOne(id: string) {
    return this.prisma.category.findUniqueOrThrow({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });
  }

  findPublicOne(id: string) {
    return this.prisma.category.findFirstOrThrow({
      where: {
        id,
        status: CategoryStatus.ACTIVE,
      },
      include: {
        parent: true,
        children: {
          where: { status: CategoryStatus.ACTIVE },
        },
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto, image?: UploadFile) {
    const currentCategory = image
      ? await this.prisma.category.findUniqueOrThrow({
          where: { id },
          select: { imagePublicId: true },
        })
      : null;

    const uploadedImage = image
      ? await this.cloudinaryService.uploadImage(image, 'categories')
      : undefined;

    try {
      const updatedCategory = await this.prisma.category.update({
        where: { id },
        data: {
          ...dto,
          slug: dto.slug ?? (dto.name ? createSlug(dto.name) : undefined),
          imageUrl: uploadedImage ? uploadedImage.secureUrl : undefined,
          imagePublicId: uploadedImage ? uploadedImage.publicId : undefined,
        },
      });

      if (uploadedImage && currentCategory?.imagePublicId) {
        await this.cloudinaryService.deleteImage(currentCategory.imagePublicId);
      }

      return updatedCategory;
    } catch (error) {
      if (uploadedImage?.publicId) {
        await this.cloudinaryService.deleteImage(uploadedImage.publicId);
      }

      throw error;
    }
  }

  async remove(id: string) {
    const currentCategory = await this.prisma.category.findUniqueOrThrow({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (currentCategory._count.products > 0) {
      return this.prisma.category.update({
        where: { id },
        data: { status: CategoryStatus.INACTIVE },
      });
    }

    const deletedCategory = await this.prisma.category.delete({
      where: { id },
    });

    if (deletedCategory.imagePublicId) {
      await this.cloudinaryService.deleteImage(deletedCategory.imagePublicId);
    }

    return deletedCategory;
  }

  activate(id: string) {
    return this.prisma.category.update({
      where: { id },
      data: { status: CategoryStatus.ACTIVE },
    });
  }

  deactivate(id: string) {
    return this.prisma.category.update({
      where: { id },
      data: { status: CategoryStatus.INACTIVE },
    });
  }
}
