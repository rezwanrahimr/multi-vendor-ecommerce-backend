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
import {
  AdminProductBulkAction,
  AdminProductBulkActionDto,
} from './dto/admin-product-bulk-action.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto, ProductStockStatus } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const ADMIN_PRODUCT_LOW_STOCK_THRESHOLD = 20;

const productInclude = {
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

type ProductRecord = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogsService: AuditLogsService,
  ) { }

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
    const result = await this.findAllInternal(query);

    return {
      ...result,
      data: result.data.map((product) => this.toAdminProduct(product)),
    };
  }

  async findPublicAll(query: ProductQueryDto) {
    return this.findAllInternal(query, this.publicWhere());
  }

  private async findAllInternal(
    query: ProductQueryDto,
    baseWhere: Prisma.ProductWhereInput = {},
  ) {
    const pagination = getPagination({ page: query.page, limit: query.limit });
    const queryWhere = this.buildProductWhere(query);
    const where: Prisma.ProductWhereInput = {
      AND: [baseWhere, queryWhere],
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { updatedAt: 'desc' },
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
    return this.prisma.product
      .findUniqueOrThrow({
        where: { id },
        include: this.defaultInclude(),
      })
      .then((product) => this.toAdminProduct(product));
  }

  async findAdminSummary(query: ProductQueryDto) {
    const baseWhere = this.buildSummaryWhere(query);
    const [totalProducts, activeProducts, pendingReview, lowStock, outOfStock] =
      await this.prisma.$transaction([
        this.prisma.product.count({ where: baseWhere }),
        this.prisma.product.count({
          where: {
            AND: [baseWhere, { status: ProductStatus.ACTIVE }],
          },
        }),
        this.prisma.product.count({
          where: {
            AND: [baseWhere, { status: ProductStatus.PENDING_REVIEW }],
          },
        }),
        this.prisma.product.count({
          where: {
            AND: [baseWhere, this.stockStateWhere(ProductStockStatus.LOW_STOCK)],
          },
        }),
        this.prisma.product.count({
          where: {
            AND: [baseWhere, this.stockStateWhere(ProductStockStatus.OUT_OF_STOCK)],
          },
        }),
      ]);

    return {
      totalProducts,
      activeProducts,
      pendingReview,
      lowStock,
      outOfStock,
      lowStockThreshold: ADMIN_PRODUCT_LOW_STOCK_THRESHOLD,
    };
  }

  async exportAdminProducts(query: ProductQueryDto) {
    const where = this.buildProductWhere(query);
    const products = await this.prisma.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: this.defaultInclude(),
    });
    const headers = [
      'id',
      'name',
      'sku',
      'vendor',
      'store',
      'category',
      'price',
      'discountPrice',
      'stock',
      'stockStatus',
      'status',
      'managementStatus',
      'updatedAt',
      'createdAt',
    ] as const;

    const rows = products.map((product) => {
      const adminProduct = this.toAdminProduct(product);

      return {
        id: adminProduct.id,
        name: adminProduct.name,
        sku: adminProduct.sku ?? '',
        vendor: adminProduct.vendor.name,
        store: adminProduct.store.name,
        category: adminProduct.category?.name ?? '',
        price: this.decimal(adminProduct.price),
        discountPrice:
          adminProduct.discountPrice !== null
            ? this.decimal(adminProduct.discountPrice)
            : '',
        stock: adminProduct.stock,
        stockStatus: adminProduct.stockStatus,
        status: adminProduct.status,
        managementStatus: adminProduct.managementStatus,
        updatedAt: adminProduct.updatedAt.toISOString(),
        createdAt: adminProduct.createdAt.toISOString(),
      };
    });

    return this.toCsv(headers, rows);
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

  findProductVendorOne(id: string, vendorId: string) {
    return this.prisma.product.findFirstOrThrow({
      where: {
        id,
        vendorId,
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
    if (dto.storeId !== undefined && dto.storeId !== current.storeId) {
      const writableStore = await this.resolveWritableStore(
        changedById,
        role,
        dto.storeId,
      );

      if (role !== UserRole.ADMIN && writableStore.id !== dto.storeId) {
        throw new ForbiddenException(
          'You can only assign products to your own store',
        );
      }
    }
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

  async bulkAction(actorId: string, dto: AdminProductBulkActionDto) {
    const data: ProductRecord[] = [];

    for (const productId of dto.productIds) {
      switch (dto.action) {
        case AdminProductBulkAction.APPROVE:
          data.push(await this.approve(productId, actorId));
          break;
        case AdminProductBulkAction.REJECT:
          data.push(await this.reject(productId, actorId));
          break;
        case AdminProductBulkAction.ACTIVATE:
          data.push(await this.activate(productId, actorId));
          break;
        case AdminProductBulkAction.DEACTIVATE:
          data.push(await this.deactivate(productId, actorId));
          break;
        case AdminProductBulkAction.DELETE:
          data.push(await this.remove(productId, actorId, UserRole.ADMIN));
          break;
        default:
          throw new BadRequestException('Unsupported bulk action');
      }
    }

    return {
      action: dto.action,
      count: data.length,
      data: data.map((product) => this.toAdminProduct(product)),
    };
  }

  private defaultInclude() {
    return productInclude;
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

  private vendorProductWhere(): Prisma.ProductWhereInput {
    return {
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
  ): Promise<ProductRecord> {
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

  private buildProductWhere(query: ProductQueryDto): Prisma.ProductWhereInput {
    const search = query.search?.trim();
    const dateRange = this.updatedAtWhere(query.startDate, query.endDate);
    const and: Prisma.ProductWhereInput[] = [
      {
        status: query.status,
        categoryId: query.categoryId,
        vendorId: query.vendorId,
        storeId: query.storeId,
        updatedAt: dateRange,
      },
    ];

    if (search) {
      and.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (query.stockStatus) {
      and.push(this.stockStateWhere(query.stockStatus));
    }

    return { AND: and };
  }

  private buildSummaryWhere(query: ProductQueryDto): Prisma.ProductWhereInput {
    return {
      categoryId: query.categoryId,
      vendorId: query.vendorId,
      storeId: query.storeId,
      updatedAt: this.updatedAtWhere(query.startDate, query.endDate),
    };
  }

  private updatedAtWhere(startDate?: string, endDate?: string) {
    if (!startDate && !endDate) {
      return undefined;
    }

    return {
      gte: startDate ? new Date(startDate) : undefined,
      lte: endDate ? this.endOfDay(endDate) : undefined,
    };
  }

  private endOfDay(date: string) {
    const value = new Date(date);
    value.setHours(23, 59, 59, 999);
    return value;
  }

  private stockStateWhere(stockStatus: ProductStockStatus): Prisma.ProductWhereInput {
    switch (stockStatus) {
      case ProductStockStatus.IN_STOCK:
        return { stock: { gt: ADMIN_PRODUCT_LOW_STOCK_THRESHOLD } };
      case ProductStockStatus.LOW_STOCK:
        return {
          stock: {
            gt: 0,
            lte: ADMIN_PRODUCT_LOW_STOCK_THRESHOLD,
          },
        };
      case ProductStockStatus.OUT_OF_STOCK:
        return {
          OR: [{ stock: { lte: 0 } }, { status: ProductStatus.OUT_OF_STOCK }],
        };
      default:
        return {};
    }
  }

  private toAdminProduct(product: ProductRecord) {
    const stockStatus = this.resolveStockStatus(product);

    return {
      ...product,
      stockStatus,
      managementStatus: this.resolveManagementStatus(product.status, stockStatus),
      isLowStock: stockStatus === ProductStockStatus.LOW_STOCK,
      isOutOfStock: stockStatus === ProductStockStatus.OUT_OF_STOCK,
    };
  }

  private resolveStockStatus(product: Pick<ProductRecord, 'stock' | 'status'>) {
    if (product.status === ProductStatus.OUT_OF_STOCK || product.stock <= 0) {
      return ProductStockStatus.OUT_OF_STOCK;
    }

    if (product.stock <= ADMIN_PRODUCT_LOW_STOCK_THRESHOLD) {
      return ProductStockStatus.LOW_STOCK;
    }

    return ProductStockStatus.IN_STOCK;
  }

  private resolveManagementStatus(
    status: ProductStatus,
    stockStatus: ProductStockStatus,
  ) {
    if (status !== ProductStatus.ACTIVE) {
      return status;
    }

    if (stockStatus === ProductStockStatus.OUT_OF_STOCK) {
      return ProductStatus.OUT_OF_STOCK;
    }

    if (stockStatus === ProductStockStatus.LOW_STOCK) {
      return ProductStockStatus.LOW_STOCK;
    }

    return ProductStatus.ACTIVE;
  }

  private decimal(value?: Prisma.Decimal | number | string | null) {
    return new Prisma.Decimal(value ?? 0).toDecimalPlaces(2).toNumber();
  }

  private toCsv(headers: readonly string[], rows: Record<string, unknown>[]) {
    const escape = (value: unknown) => {
      const content = String(value ?? '');
      return `"${content.replace(/"/g, '""')}"`;
    };
    const lines = [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
    ];

    return lines.join('\n');
  }
}
