import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CategoryStatus,
  Prisma,
  ProductStatus,
  StoreStatus,
  StoreVerificationStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CommissionsService } from '../commissions/commissions.service';
import { CouponsService } from '../coupons/coupons.service';
import { DeliveryType } from '../delivery-zones/dto/calculate-delivery-charge.dto';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { CalculateCheckoutDto, CheckoutItemDto } from './dto/calculate-checkout.dto';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryZonesService: DeliveryZonesService,
    private readonly commissionsService: CommissionsService,
    private readonly couponsService: CouponsService,
  ) {}

  async calculate(customerId: string, dto: CalculateCheckoutDto) {
    const requestedItems = await this.resolveRequestedItems(customerId, dto.items);
    const productIds = requestedItems.map((item) => item.productId);
    const quantityByProductId = new Map(
      requestedItems.map((item) => [item.productId, item.quantity]),
    );
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        category: {
          select: {
            id: true,
            status: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            status: true,
            verificationStatus: true,
            vendor: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more selected products do not exist');
    }

    const calculatedItems = [];
    let subtotal = new Prisma.Decimal(0);

    for (const product of products) {
      this.assertCheckoutableProduct(product);

      const quantity = quantityByProductId.get(product.id) ?? 0;
      this.assertQuantityAvailable(product.stock, quantity);

      if (!product.categoryId) {
        throw new BadRequestException('Selected product category is unavailable');
      }

      const unitPrice = this.getProductUnitPrice(product);
      const itemSubtotal = unitPrice.mul(quantity).toDecimalPlaces(2);
      const commission = await this.commissionsService.calculateCommission({
        vendorId: product.vendorId,
        categoryId: product.categoryId,
        productId: product.id,
        price: unitPrice,
        quantity,
      });

      subtotal = subtotal.add(itemSubtotal);
      calculatedItems.push({
        productId: product.id,
        productName: product.name,
        vendorId: product.vendorId,
        storeId: product.storeId,
        categoryId: product.categoryId,
        quantity,
        unitPrice: unitPrice.toDecimalPlaces(2).toNumber(),
        subtotal: itemSubtotal.toNumber(),
        commissionRuleId: commission.ruleId,
        commissionSource: commission.source,
        commissionType: commission.commissionType,
        commissionValue: commission.commissionValue,
        commissionAmount: commission.commissionAmount,
        vendorEarning: commission.vendorEarning,
      });
    }

    const deliveryType = dto.deliveryType ?? DeliveryType.NORMAL;
    const delivery = await this.deliveryZonesService.calculateCharge(
      dto.deliveryZoneId,
      subtotal,
      deliveryType,
    );
    const deliveryCharge = new Prisma.Decimal(delivery.deliveryCharge);
    const coupon = await this.couponsService.calculateDiscount({
      customerId,
      couponCode: dto.couponCode,
      subtotal,
      deliveryCharge,
      items: calculatedItems,
    });
    const discountAmount = coupon?.discountAmount ?? new Prisma.Decimal(0);
    const grandTotal = Prisma.Decimal.max(
      subtotal.add(deliveryCharge).minus(discountAmount),
      0,
    );
    const totalQuantity = calculatedItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    return {
      items: calculatedItems,
      summary: {
        subtotal: subtotal.toDecimalPlaces(2).toNumber(),
        discountAmount: discountAmount.toNumber(),
        deliveryCharge: deliveryCharge.toDecimalPlaces(2).toNumber(),
        grandTotal: grandTotal.toDecimalPlaces(2).toNumber(),
        itemCount: calculatedItems.length,
        totalQuantity,
      },
      delivery: {
        deliveryZoneId: delivery.deliveryZoneId,
        deliveryType: delivery.deliveryType,
        estimatedDeliveryTime: delivery.estimatedDeliveryTime,
        isFreeDelivery: delivery.isFreeDelivery,
      },
      coupon: coupon
        ? {
            couponId: coupon.couponId,
            code: coupon.couponCode,
            discountType: coupon.discountType,
            discountAmount: coupon.discountAmount.toNumber(),
          }
        : null,
      vendorBreakdown: this.buildVendorBreakdown(calculatedItems),
    };
  }

  async validateCoupon(customerId: string, dto: CalculateCheckoutDto) {
    const result = await this.calculate(customerId, dto);

    if (!result.coupon) {
      throw new BadRequestException('Coupon code is required');
    }

    return result.coupon;
  }

  private async resolveRequestedItems(
    customerId: string,
    items?: CheckoutItemDto[],
  ) {
    const sourceItems = items ?? (await this.getCartItems(customerId));
    const merged = new Map<string, number>();

    for (const item of sourceItems) {
      merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    }

    const resolvedItems = Array.from(merged.entries()).map(
      ([productId, quantity]) => ({ productId, quantity }),
    );

    if (resolvedItems.length < 1) {
      throw new BadRequestException('Checkout requires at least one item');
    }

    return resolvedItems;
  }

  private async getCartItems(customerId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { customerId },
      select: {
        items: {
          select: {
            productId: true,
            quantity: true,
          },
        },
      },
    });

    return cart?.items ?? [];
  }

  private assertCheckoutableProduct(product: {
    status: ProductStatus;
    stock: number;
    category: { status: CategoryStatus } | null;
    store: {
      status: StoreStatus;
      verificationStatus: StoreVerificationStatus;
      vendor: { status: UserStatus };
    };
  }) {
    if (product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException('Selected product is not available');
    }

    if (product.stock < 1) {
      throw new BadRequestException('Selected product is out of stock');
    }

    if (!product.category || product.category.status !== CategoryStatus.ACTIVE) {
      throw new BadRequestException('Selected product category is unavailable');
    }

    if (
      product.store.status !== StoreStatus.ACTIVE ||
      product.store.verificationStatus !== StoreVerificationStatus.VERIFIED ||
      product.store.vendor.status !== UserStatus.ACTIVE
    ) {
      throw new BadRequestException('Selected product vendor is unavailable');
    }
  }

  private assertQuantityAvailable(stock: number, quantity: number) {
    if (quantity > stock) {
      throw new BadRequestException('Requested quantity exceeds available stock');
    }
  }

  private getProductUnitPrice(product: {
    price: Prisma.Decimal;
    discountPrice: Prisma.Decimal | null;
  }) {
    return new Prisma.Decimal(product.discountPrice ?? product.price);
  }

  private buildVendorBreakdown(
    items: Array<{
      vendorId: string;
      storeId: string;
      subtotal: number;
      commissionAmount: number;
      vendorEarning: number;
    }>,
  ) {
    const breakdown = new Map<
      string,
      {
        vendorId: string;
        storeId: string;
        subtotal: Prisma.Decimal;
        commissionAmount: Prisma.Decimal;
        vendorEarning: Prisma.Decimal;
      }
    >();

    for (const item of items) {
      const key = `${item.vendorId}:${item.storeId}`;
      const existing =
        breakdown.get(key) ??
        {
          vendorId: item.vendorId,
          storeId: item.storeId,
          subtotal: new Prisma.Decimal(0),
          commissionAmount: new Prisma.Decimal(0),
          vendorEarning: new Prisma.Decimal(0),
        };

      existing.subtotal = existing.subtotal.add(item.subtotal);
      existing.commissionAmount = existing.commissionAmount.add(
        item.commissionAmount,
      );
      existing.vendorEarning = existing.vendorEarning.add(item.vendorEarning);
      breakdown.set(key, existing);
    }

    return Array.from(breakdown.values()).map((item) => ({
      vendorId: item.vendorId,
      storeId: item.storeId,
      subtotal: item.subtotal.toDecimalPlaces(2).toNumber(),
      commissionAmount: item.commissionAmount.toDecimalPlaces(2).toNumber(),
      vendorEarning: item.vendorEarning.toDecimalPlaces(2).toNumber(),
    }));
  }
}
