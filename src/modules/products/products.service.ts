import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  CategoryStatus,
  NotificationType,
  Prisma,
  ProductStatus,
  StockLogType,
  StoreStatus,
  StoreVerificationStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { UploadedImageFile } from '../../common/pipes/images-upload.pipe';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    private readonly notificationsService: NotificationsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(
    userId: string,
    role: UserRole,
    dto: CreateProductDto,
    images: UploadedImageFile[],
  ) {
    const slug = dto.slug ?? createSlug(dto.name);
    const store = await this.resolveWritableStore(
      userId,
      role,
      role === UserRole.ADMIN ? dto.storeId : undefined,
    );
    const stock = dto.stock ?? 0;
    const status =
      role === UserRole.ADMIN
        ? (dto.status ?? ProductStatus.ACTIVE)
        : ProductStatus.PENDING_REVIEW;

    this.validatePricing(dto.price, dto.discountPrice);
    await this.assertActiveCategory(dto.categoryId);
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
            status,
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
    return this.findAllInternal(query);
  }

  async findPublicAll(query: ProductQueryDto) {
    return this.findAllInternal(query, this.publicWhere());
  }

  private async findAllInternal(
    query: ProductQueryDto,
    baseWhere: Prisma.ProductWhereInput = {},
  ) {
    const pagination = getPagination({ page: query.page, limit: query.limit });
    const queryWhere: Prisma.ProductWhereInput = {
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
    const where: Prisma.ProductWhereInput = {
      AND: [baseWhere, queryWhere],
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
    return this.findAllInternal({
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

  findPublicOne(id: string) {
    return this.prisma.product.findFirstOrThrow({
      where: {
        id,
        ...this.publicWhere(),
      },
      include: this.defaultInclude(),
    });
  }

  findBySlug(slug: string) {
    return this.prisma.product.findUniqueOrThrow({
      where: { slug },
      include: this.defaultInclude(),
    });
  }

  findPublicBySlug(slug: string) {
    return this.prisma.product.findFirstOrThrow({
      where: {
        slug,
        ...this.publicWhere(),
      },
      include: this.defaultInclude(),
    });
  }

  async findVendorOne(id: string, vendorId: string) {
    const product = await this.findOne(id);

    this.assertCanWriteProduct(product.vendorId, vendorId, UserRole.VENDOR);

    return product;
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
        status: true,
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
    await this.assertActiveCategory(dto.categoryId);

    const uploadedImages =
      images.length > 0 ? await this.uploadProductImages(images) : [];

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const updatedProduct = await tx.product.update({
          where: { id },
          data: {
            ...dto,
            status: this.resolveUpdateStatus(role, dto, uploadedImages.length > 0),
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
    const product = await this.prisma.$transaction(async (tx) => {
      const current = await tx.product.findUniqueOrThrow({
        where: { id },
        select: {
          vendorId: true,
          imagePublicIds: true,
          _count: {
            select: { orderItems: true },
          },
        },
      });

      this.assertCanWriteProduct(current.vendorId, userId, role);

      if (current._count.orderItems > 0) {
        return tx.product.update({
          where: { id },
          data: { status: ProductStatus.INACTIVE },
          include: this.defaultInclude(),
        });
      }

      const deletedProduct = await tx.product.delete({
        where: { id },
        include: this.defaultInclude(),
      });

      await this.deleteUploadedImages(current.imagePublicIds);

      return deletedProduct;
    });

    return product;
  }

  approve(id: string, actorId?: string) {
    return this.updateStatus(id, ProductStatus.ACTIVE, actorId, 'PRODUCT_APPROVED');
  }

  reject(id: string, actorId?: string) {
    return this.updateStatus(id, ProductStatus.REJECTED, actorId, 'PRODUCT_REJECTED');
  }

  activate(id: string, actorId?: string) {
    return this.updateStatus(id, ProductStatus.ACTIVE, actorId, 'PRODUCT_ACTIVATED');
  }

  deactivate(id: string, actorId?: string) {
    return this.updateStatus(id, ProductStatus.INACTIVE, actorId, 'PRODUCT_DEACTIVATED');
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
          status: true,
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
          status: true,
          verificationStatus: true,
        },
      });
    }

    if (role !== UserRole.VENDOR) {
      throw new ForbiddenException('Only vendors can create products');
    }

    const existingStore = await this.prisma.store.findUnique({
      where: { vendorId: userId },
      select: {
        id: true,
        vendorId: true,
        status: true,
        verificationStatus: true,
        vendor: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!existingStore) {
      throw new ForbiddenException('A vendor store is required before adding products');
    }

    if (
      existingStore.status !== StoreStatus.ACTIVE ||
      existingStore.verificationStatus !== StoreVerificationStatus.VERIFIED ||
      existingStore.vendor.status !== UserStatus.ACTIVE
    ) {
      throw new ForbiddenException('Your store must be active and verified before adding products');
    }

    return existingStore;
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

  private publicWhere(): Prisma.ProductWhereInput {
    return {
      status: ProductStatus.ACTIVE,
      stock: { gt: 0 },
      store: {
        status: StoreStatus.ACTIVE,
        verificationStatus: StoreVerificationStatus.VERIFIED,
        vendor: {
          status: UserStatus.ACTIVE,
        },
      },
      OR: [
        { categoryId: null },
        {
          category: {
            status: CategoryStatus.ACTIVE,
          },
        },
      ],
    };
  }

  private async assertActiveCategory(categoryId?: string | null) {
    if (!categoryId) {
      return;
    }

    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { status: true },
    });

    if (!category || category.status !== CategoryStatus.ACTIVE) {
      throw new BadRequestException('Selected category is unavailable');
    }
  }

  private resolveUpdateStatus(
    role: UserRole,
    dto: UpdateProductDto,
    hasNewImages: boolean,
  ) {
    if (role === UserRole.ADMIN) {
      return dto.status;
    }

    const hasReviewableChanges = Boolean(
      dto.name !== undefined ||
        dto.description !== undefined ||
        dto.price !== undefined ||
        dto.discountPrice !== undefined ||
        dto.categoryId !== undefined ||
        hasNewImages,
    );

    if (hasReviewableChanges) {
      return ProductStatus.PENDING_REVIEW;
    }

    const vendorAllowedStatuses: ProductStatus[] = [
      ProductStatus.DRAFT,
      ProductStatus.INACTIVE,
      ProductStatus.OUT_OF_STOCK,
    ];

    if (dto.status && vendorAllowedStatuses.includes(dto.status)) {
      return dto.status;
    }

    return undefined;
  }

  private updateStatus(
    id: string,
    status: ProductStatus,
    actorId?: string,
    action?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.product.findUniqueOrThrow({
        where: { id },
        select: { status: true, vendorId: true, name: true },
      });
      const product = await tx.product.update({
        where: { id },
        data: { status },
        include: this.defaultInclude(),
      });

      if (action) {
        await this.auditLogsService.log(
          {
            actorId,
            action,
            entityType: 'Product',
            entityId: id,
            metadata: { from: current.status, to: status },
          },
          tx,
        );
      }

      if (
        action === 'PRODUCT_APPROVED' ||
        action === 'PRODUCT_REJECTED'
      ) {
        await this.notificationsService.create(
          {
            userId: current.vendorId,
            title:
              action === 'PRODUCT_APPROVED'
                ? 'Product approved'
                : 'Product rejected',
            message:
              action === 'PRODUCT_APPROVED'
                ? `${current.name} has been approved.`
                : `${current.name} has been rejected.`,
            type:
              action === 'PRODUCT_APPROVED'
                ? NotificationType.PRODUCT_APPROVED
                : NotificationType.PRODUCT_REJECTED,
            data: { productId: id },
          },
          tx,
        );
      }

      return product;
    });
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
