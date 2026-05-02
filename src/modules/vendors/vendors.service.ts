import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  StoreStatus,
  StoreVerificationStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildPaginationMeta,
  getPagination,
} from '../../utils/pagination.util';
import { UpdateVendorStoreDto } from './dto/update-vendor-store.dto';

type UploadFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
  size?: number;
};

type StoreImages = {
  logo?: UploadFile;
  banner?: UploadFile;
};

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  findMyStore(vendorId: string) {
    return this.prisma.store.findUniqueOrThrow({
      where: { vendorId },
      include: this.storeInclude(),
    });
  }

  async updateMyStore(
    vendorId: string,
    dto: UpdateVendorStoreDto,
    images: StoreImages = {},
  ) {
    const currentStore = await this.prisma.store.findUniqueOrThrow({
      where: { vendorId },
      select: {
        logoPublicId: true,
        bannerPublicId: true,
      },
    });

    this.validateStoreImage(images.logo);
    this.validateStoreImage(images.banner);

    const uploadedLogo = images.logo
      ? await this.cloudinaryService.uploadImage(images.logo, 'stores/logos')
      : undefined;
    const uploadedBanner = images.banner
      ? await this.cloudinaryService.uploadImage(images.banner, 'stores/banners')
      : undefined;

    try {
      const updatedStore = await this.prisma.store.update({
        where: { vendorId },
        data: {
          name: dto.name,
          description: dto.description,
          phone: dto.phone,
          address: dto.address as Prisma.InputJsonValue | undefined,
          logoUrl: uploadedLogo?.secureUrl,
          logoPublicId: uploadedLogo?.publicId,
          bannerUrl: uploadedBanner?.secureUrl,
          bannerPublicId: uploadedBanner?.publicId,
        },
        include: this.storeInclude(),
      });

      if (uploadedLogo && currentStore.logoPublicId) {
        await this.cloudinaryService.deleteImage(currentStore.logoPublicId);
      }

      if (uploadedBanner && currentStore.bannerPublicId) {
        await this.cloudinaryService.deleteImage(currentStore.bannerPublicId);
      }

      return updatedStore;
    } catch (error) {
      await this.cloudinaryService.deleteImage(uploadedLogo?.publicId);
      await this.cloudinaryService.deleteImage(uploadedBanner?.publicId);
      throw error;
    }
  }

  async findAll(query: { page?: number; limit?: number }) {
    const pagination = getPagination({ page: query.page, limit: query.limit });
    const where: Prisma.UserWhereInput = {
      role: UserRole.VENDOR,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        select: this.vendorSelect(),
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  async findOne(vendorId: string) {
    const vendor = await this.prisma.user.findFirst({
      where: {
        id: vendorId,
        role: UserRole.VENDOR,
      },
      select: this.vendorSelect(),
    });

    if (!vendor) {
      throw new NotFoundException('Vendor was not found');
    }

    return vendor;
  }

  approve(vendorId: string, actorId?: string) {
    return this.updateVendorModeration(vendorId, {
      userStatus: UserStatus.ACTIVE,
      storeStatus: StoreStatus.ACTIVE,
      verificationStatus: StoreVerificationStatus.VERIFIED,
    }, actorId, 'VENDOR_APPROVED');
  }

  reject(vendorId: string, actorId?: string) {
    return this.updateVendorModeration(vendorId, {
      verificationStatus: StoreVerificationStatus.REJECTED,
    }, actorId, 'VENDOR_REJECTED');
  }

  suspend(vendorId: string, actorId?: string) {
    return this.updateVendorModeration(vendorId, {
      userStatus: UserStatus.SUSPENDED,
      storeStatus: StoreStatus.SUSPENDED,
    }, actorId, 'VENDOR_SUSPENDED');
  }

  activate(vendorId: string, actorId?: string) {
    return this.updateVendorModeration(vendorId, {
      userStatus: UserStatus.ACTIVE,
      storeStatus: StoreStatus.ACTIVE,
    }, actorId, 'VENDOR_ACTIVATED');
  }

  private async updateVendorModeration(
    vendorId: string,
    data: {
      userStatus?: UserStatus;
      storeStatus?: StoreStatus;
      verificationStatus?: StoreVerificationStatus;
    },
    actorId?: string,
    action?: string,
  ) {
    await this.findOne(vendorId);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: vendorId },
        data: {
          status: data.userStatus,
        },
      });
      await tx.store.update({
        where: { vendorId },
        data: {
          status: data.storeStatus,
          verificationStatus: data.verificationStatus,
        },
      });

      if (action) {
        await this.auditLogsService.log(
          {
            actorId,
            action,
            entityType: 'Vendor',
            entityId: vendorId,
            metadata: data,
          },
          tx,
        );
      }

      if (
        action === 'VENDOR_APPROVED' ||
        action === 'VENDOR_REJECTED'
      ) {
        await this.notificationsService.create(
          {
            userId: vendorId,
            title:
              action === 'VENDOR_APPROVED'
                ? 'Vendor approved'
                : 'Vendor rejected',
            message:
              action === 'VENDOR_APPROVED'
                ? 'Your vendor store has been approved.'
                : 'Your vendor store has been rejected.',
            type: NotificationType.VENDOR_APPROVED,
            data: { vendorId, action },
          },
          tx,
        );
      }
    });

    return this.findOne(vendorId);
  }

  private storeInclude() {
    return {
      vendor: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
        },
      },
      _count: {
        select: {
          products: true,
        },
      },
    } as const;
  }

  private vendorSelect() {
    return {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatarUrl: true,
      status: true,
      store: {
        include: {
          _count: {
            select: { products: true },
          },
        },
      },
      wallet: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private validateStoreImage(file?: UploadFile) {
    if (!file) {
      return;
    }

    if (!file.buffer) {
      throw new BadRequestException('Uploaded store image file is invalid.');
    }

    if (!file.mimetype || !/^image\/(jpeg|jpg|png|webp)$/i.test(file.mimetype)) {
      throw new BadRequestException(
        `${file.originalname ?? 'Store image'} must be a JPG, PNG, or WEBP file.`,
      );
    }

    if (file.size && file.size > 5 * 1024 * 1024) {
      throw new BadRequestException(
        `${file.originalname ?? 'Store image'} exceeds the maximum size of 5MB.`,
      );
    }
  }
}
