import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponDiscountType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  buildPaginationMeta,
  getPagination,
} from '../../utils/pagination.util';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { CouponQueryDto } from './dto/coupon-query.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

type CouponItem = {
  productId: string;
  vendorId: string;
  categoryId?: string | null;
};

type CalculateCouponParams = {
  customerId: string;
  couponCode?: string;
  subtotal: Prisma.Decimal;
  deliveryCharge: Prisma.Decimal;
  items: CouponItem[];
};

type ConsumeCouponParams = CalculateCouponParams & {
  orderId: string;
};

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCouponDto) {
    this.assertValidDiscount(dto.discountType, dto.discountValue);

    return this.prisma.coupon.create({
      data: this.toCouponData(dto) as Prisma.CouponUncheckedCreateInput,
    });
  }

  async findAll(query: CouponQueryDto) {
    const pagination = getPagination({ page: query.page, limit: query.limit });
    const where = this.buildWhere(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  findOne(id: string) {
    return this.prisma.coupon.findUniqueOrThrow({ where: { id } });
  }

  async findActive() {
    const now = new Date();

    return this.prisma.coupon.findMany({
      where: {
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateCouponDto) {
    if (dto.discountType || dto.discountValue !== undefined) {
      const current = await this.prisma.coupon.findUniqueOrThrow({
        where: { id },
        select: { discountType: true, discountValue: true },
      });

      this.assertValidDiscount(
        dto.discountType ?? current.discountType,
        dto.discountValue ?? current.discountValue.toNumber(),
      );
    }

    return this.prisma.coupon.update({
      where: { id },
      data: this.toCouponData(dto) as Prisma.CouponUncheckedUpdateInput,
    });
  }

  activate(id: string) {
    return this.prisma.coupon.update({
      where: { id },
      data: { isActive: true },
    });
  }

  deactivate(id: string) {
    return this.prisma.coupon.update({
      where: { id },
      data: { isActive: false },
    });
  }

  remove(id: string) {
    return this.prisma.coupon.delete({ where: { id } });
  }

  calculateDiscount(params: CalculateCouponParams) {
    return this.calculateDiscountWithClient(this.prisma, params);
  }

  async calculateDiscountWithClient(
    client: Prisma.TransactionClient | PrismaService,
    params: CalculateCouponParams,
  ) {
    if (!params.couponCode) {
      return null;
    }

    const coupon = await this.findUsableCoupon(client, params);
    const discountAmount = this.getDiscountAmount(
      coupon,
      params.subtotal,
      params.deliveryCharge,
    );

    return {
      couponId: coupon.id,
      couponCode: coupon.code,
      discountType: coupon.discountType,
      discountAmount,
    };
  }

  async consumeCoupon(
    client: Prisma.TransactionClient,
    params: ConsumeCouponParams,
  ) {
    const couponDiscount = await this.calculateDiscountWithClient(client, params);

    if (!couponDiscount) {
      return null;
    }

    const coupon = await client.coupon.findUniqueOrThrow({
      where: { id: couponDiscount.couponId },
      select: { id: true, usageLimit: true },
    });

    if (coupon.usageLimit) {
      const updated = await client.coupon.updateMany({
        where: {
          id: coupon.id,
          usedCount: { lt: coupon.usageLimit },
        },
        data: { usedCount: { increment: 1 } },
      });

      if (updated.count === 0) {
        throw new BadRequestException('Coupon usage limit has been reached');
      }
    } else {
      await client.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    await client.couponUsage.create({
      data: {
        couponId: coupon.id,
        customerId: params.customerId,
        orderId: params.orderId,
      },
    });

    return couponDiscount;
  }

  private async findUsableCoupon(
    client: Prisma.TransactionClient | PrismaService,
    params: CalculateCouponParams,
  ) {
    const code = this.normalizeCode(params.couponCode ?? '');
    const coupon = await client.coupon.findUnique({
      where: { code },
    });
    const now = new Date();

    if (!coupon) {
      throw new NotFoundException('Coupon was not found');
    }

    if (!coupon.isActive) {
      throw new BadRequestException('Coupon is not active');
    }

    if (coupon.startsAt && coupon.startsAt > now) {
      throw new BadRequestException('Coupon is not active yet');
    }

    if (coupon.endsAt && coupon.endsAt < now) {
      throw new BadRequestException('Coupon has expired');
    }

    if (
      coupon.minimumOrderAmount &&
      params.subtotal.lt(coupon.minimumOrderAmount)
    ) {
      throw new BadRequestException('Order subtotal does not meet coupon minimum');
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit has been reached');
    }

    if (coupon.perUserLimit) {
      const userUsageCount = await client.couponUsage.count({
        where: {
          couponId: coupon.id,
          customerId: params.customerId,
        },
      });

      if (userUsageCount >= coupon.perUserLimit) {
        throw new BadRequestException('Coupon per-user limit has been reached');
      }
    }

    this.assertCouponScope(coupon, params.items);

    return coupon;
  }

  private getDiscountAmount(
    coupon: {
      discountType: CouponDiscountType;
      discountValue: Prisma.Decimal;
      maxDiscount: Prisma.Decimal | null;
    },
    subtotal: Prisma.Decimal,
    deliveryCharge: Prisma.Decimal,
  ) {
    let discount = new Prisma.Decimal(0);

    if (coupon.discountType === CouponDiscountType.PERCENTAGE) {
      discount = subtotal.mul(coupon.discountValue).div(100);
    } else if (coupon.discountType === CouponDiscountType.FIXED) {
      discount = new Prisma.Decimal(coupon.discountValue);
    } else {
      discount = deliveryCharge;
    }

    if (coupon.maxDiscount && discount.gt(coupon.maxDiscount)) {
      discount = new Prisma.Decimal(coupon.maxDiscount);
    }

    const cap =
      coupon.discountType === CouponDiscountType.FREE_DELIVERY
        ? deliveryCharge
        : subtotal;

    return Prisma.Decimal.min(discount, cap).toDecimalPlaces(2);
  }

  private assertCouponScope(
    coupon: {
      vendorId: string | null;
      categoryId: string | null;
      productId: string | null;
    },
    items: CouponItem[],
  ) {
    if (
      coupon.vendorId &&
      !items.some((item) => item.vendorId === coupon.vendorId)
    ) {
      throw new BadRequestException('Coupon does not apply to this vendor');
    }

    if (
      coupon.categoryId &&
      !items.some((item) => item.categoryId === coupon.categoryId)
    ) {
      throw new BadRequestException('Coupon does not apply to this category');
    }

    if (
      coupon.productId &&
      !items.some((item) => item.productId === coupon.productId)
    ) {
      throw new BadRequestException('Coupon does not apply to this product');
    }
  }

  private assertValidDiscount(
    discountType: CouponDiscountType,
    discountValue: number,
  ) {
    if (
      discountType !== CouponDiscountType.FREE_DELIVERY &&
      discountValue <= 0
    ) {
      throw new BadRequestException('Coupon discount value must be greater than 0');
    }

    if (
      discountType === CouponDiscountType.PERCENTAGE &&
      discountValue > 100
    ) {
      throw new BadRequestException('Percentage coupon cannot exceed 100');
    }
  }

  private buildWhere(query: CouponQueryDto): Prisma.CouponWhereInput {
    return {
      isActive: query.isActive,
      vendorId: query.vendorId,
      categoryId: query.categoryId,
      productId: query.productId,
      OR: query.search
        ? [
            { code: { contains: query.search, mode: 'insensitive' } },
            { title: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
  }

  private toCouponData(dto: CreateCouponDto | UpdateCouponDto) {
    return {
      code: dto.code ? this.normalizeCode(dto.code) : undefined,
      title: dto.title,
      description: dto.description,
      discountType: dto.discountType,
      discountValue:
        dto.discountValue !== undefined
          ? new Prisma.Decimal(dto.discountValue)
          : undefined,
      maxDiscount:
        dto.maxDiscount !== undefined
          ? new Prisma.Decimal(dto.maxDiscount)
          : undefined,
      minimumOrderAmount:
        dto.minimumOrderAmount !== undefined
          ? new Prisma.Decimal(dto.minimumOrderAmount)
          : undefined,
      usageLimit: dto.usageLimit,
      perUserLimit: dto.perUserLimit,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      isActive: dto.isActive,
      vendorId: dto.vendorId,
      categoryId: dto.categoryId,
      productId: dto.productId,
    };
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }
}
