import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, StockLogType, UserRole } from '@prisma/client';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { UploadedImageFile } from '../../common/pipes/images-upload.pipe';
import { PrismaService } from '../../database/prisma.service';
import {
  buildPaginationMeta,
  getPagination,
} from '../../utils/pagination.util';
import { createSlug } from '../../utils/slug.util';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(
    userId: string,
    role: UserRole,
    dto: CreateProductDto,
    images: UploadedImageFile[],
  ) {
    const slug = dto.slug ?? createSlug(dto.name);
    const store = await this.resolveWritableStore(userId, role, dto.storeId);
    const stock = dto.stock ?? 0;

    this.validatePricing(dto.price, dto.discountPrice);
    const uploadedImages = await this.uploadProductImages(images);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            vendorId: store.vendorId,
            storeId: store.id,
            categoryId: dto.categoryId,
            name: dto.name,
            slug,
            description: dto.description,
            price: dto.price,
            discountPrice: dto.discountPrice,
            stock,
            sku: dto.sku,
            images: uploadedImages.map((image) => image.secureUrl),
            imagePublicIds: uploadedImages.map((image) => image.publicId),
            status: dto.status,
          },
        });

        if (stock > 0) {
          await tx.stockLog.create({
            data: {
              productId: product.id,
              storeId: store.id,
              changedById: userId,
              type: StockLogType.INCREASE,
              quantity: stock,
              previousStock: 0,
              newStock: stock,
              reason: 'INITIAL_STOCK',
            },
          });
        }

        return tx.product.findUniqueOrThrow({
          where: { id: product.id },
          include: this.defaultInclude(),
        });
      });
    } catch (error) {
      await this.deleteUploadedImages(
        uploadedImages.map((image) => image.publicId),
      );
      throw error;
    }
  }

  async findAll(query: ProductQueryDto) {
    const pagination = getPagination({ page: query.page, limit: query.limit });
    const where: Prisma.ProductWhereInput = {
      status: query.status,
      categoryId: query.categoryId,
      vendorId: query.vendorId,
      storeId: query.storeId,
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: this.defaultInclude(),
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  findForVendor(vendorId: string, query: ProductQueryDto) {
    return this.findAll({
      ...query,
      vendorId,
    });
  }

  findOne(id: string) {
    return this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: this.defaultInclude(),
    });
  }

  findBySlug(slug: string) {
    return this.prisma.product.findUniqueOrThrow({
      where: { slug },
      include: this.defaultInclude(),
    });
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    changedById: string,
    role: UserRole,
    images: UploadedImageFile[] = [],
  ) {
    const current = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      select: {
        price: true,
        discountPrice: true,
        stock: true,
        storeId: true,
        vendorId: true,
        imagePublicIds: true,
      },
    });

    const currentDiscountPrice =
      current.discountPrice === null
        ? undefined
        : Number(current.discountPrice);
    const nextDiscountPrice =
      dto.discountPrice === null
        ? undefined
        : (dto.discountPrice ?? currentDiscountPrice);

    this.assertCanWriteProduct(current.vendorId, changedById, role);
    this.validatePricing(dto.price ?? Number(current.price), nextDiscountPrice);

    const uploadedImages =
      images.length > 0 ? await this.uploadProductImages(images) : [];

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const updatedProduct = await tx.product.update({
          where: { id },
          data: {
            ...dto,
            slug: dto.slug ?? (dto.name ? createSlug(dto.name) : undefined),
            images:
              uploadedImages.length > 0
                ? uploadedImages.map((image) => image.secureUrl)
                : undefined,
            imagePublicIds:
              uploadedImages.length > 0
                ? uploadedImages.map((image) => image.publicId)
                : undefined,
          },
          include: this.defaultInclude(),
        });

        if (dto.stock !== undefined && dto.stock !== current.stock) {
          const change = dto.stock - current.stock;

          await tx.stockLog.create({
            data: {
              productId: id,
              storeId: current.storeId,
              changedById,
              type: change > 0 ? StockLogType.INCREASE : StockLogType.DECREASE,
              quantity: Math.abs(change),
              previousStock: current.stock,
              newStock: dto.stock,
              reason: 'MANUAL_ADJUSTMENT',
            },
          });
        }

        return updatedProduct;
      });

      if (uploadedImages.length > 0) {
        await this.deleteUploadedImages(current.imagePublicIds);
      }

      return product;
    } catch (error) {
      await this.deleteUploadedImages(
        uploadedImages.map((image) => image.publicId),
      );
      throw error;
    }
  }

  async remove(id: string, userId: string, role: UserRole) {
    const deletedProduct = await this.prisma.$transaction(async (tx) => {
      const current = await tx.product.findUniqueOrThrow({
        where: { id },
        select: {
          vendorId: true,
          imagePublicIds: true,
        },
      });

      this.assertCanWriteProduct(current.vendorId, userId, role);

      return tx.product.delete({
        where: { id },
        include: this.defaultInclude(),
      });
    });

    await this.deleteUploadedImages(deletedProduct.imagePublicIds);

    return deletedProduct;
  }

  private defaultInclude() {
    return {
      vendor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          verificationStatus: true,
          commissionRate: true,
        },
      },
      category: true,
    } as const;
  }

  private async resolveWritableStore(
    userId: string,
    role: UserRole,
    storeId?: string,
  ) {
    if (role === UserRole.ADMIN) {
      if (!storeId) {
        throw new BadRequestException(
          'storeId is required when an admin creates a product',
        );
      }

      return this.prisma.store.findUniqueOrThrow({
        where: { id: storeId },
        select: {
          id: true,
          vendorId: true,
        },
      });
    }

    if (role !== UserRole.VENDOR) {
      throw new ForbiddenException('Only vendors can create products');
    }

    if (storeId) {
      const store = await this.prisma.store.findUniqueOrThrow({
        where: { id: storeId },
        select: {
          id: true,
          vendorId: true,
        },
      });

      if (store.vendorId !== userId) {
        throw new ForbiddenException(
          'You can only add products to your own store',
        );
      }

      return store;
    }

    const existingStore = await this.prisma.store.findUnique({
      where: { vendorId: userId },
      select: {
        id: true,
        vendorId: true,
      },
    });

    if (existingStore) {
      return existingStore;
    }

    const vendor = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
      },
    });

    return this.prisma.store.create({
      data: {
        vendorId: vendor.id,
        name: `${vendor.name}'s Store`,
        slug: createSlug(`${vendor.name}-${vendor.id.slice(0, 8)}`),
      },
      select: {
        id: true,
        vendorId: true,
      },
    });
  }

  private assertCanWriteProduct(
    productVendorId: string,
    userId: string,
    role: UserRole,
  ) {
    if (role === UserRole.ADMIN) {
      return;
    }

    if (role !== UserRole.VENDOR || productVendorId !== userId) {
      throw new ForbiddenException('You can only manage your own products');
    }
  }

  private validatePricing(price: number, discountPrice?: number) {
    if (price <= 0) {
      throw new BadRequestException('price must be greater than 0');
    }

    if (discountPrice !== undefined && discountPrice >= price) {
      throw new BadRequestException(
        'discountPrice must be lower than the product price',
      );
    }
  }

  private uploadProductImages(images: UploadedImageFile[]) {
    if (images.length < 1) {
      throw new BadRequestException('At least one product image is required');
    }

    if (images.length > 3) {
      throw new BadRequestException('A product can have a maximum of 3 images');
    }

    return Promise.all(
      images.map((image) =>
        this.cloudinaryService.uploadImage(image, 'products'),
      ),
    );
  }

  private async deleteUploadedImages(publicIds: string[]) {
    await Promise.all(
      publicIds.map((publicId) => this.cloudinaryService.deleteImage(publicId)),
    );
  }
}
