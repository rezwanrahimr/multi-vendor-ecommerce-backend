import { Injectable } from '@nestjs/common';
import {
  CategoryStatus,
  DeliveryStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ProductStatus,
  StoreStatus,
  StoreVerificationStatus,
  UserRole,
  WithdrawalStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DashboardPeriod, DashboardQueryDto } from './dto/dashboard-query.dto';

type DateRange = {
  start: Date;
  end: Date;
};

@Injectable()
export class DashboardService {
  private readonly lowStockThreshold = 5;

  constructor(private readonly prisma: PrismaService) {}

  async getAdminDashboard(query: DashboardQueryDto) {
    const range = this.resolveDateRange(query);
    const today = this.getDayRange(new Date());
    const limit = this.resolveLimit(query.limit);
    const paidOrderWhere = { paymentStatus: PaymentStatus.PAID };
    const [
      totalRevenue,
      todayRevenue,
      totalOrders,
      todayOrders,
      pendingOrders,
      deliveredOrders,
      cancelledOrders,
      pendingPayments,
      paidPayments,
      pendingPayouts,
      totalVendors,
      pendingVendors,
      activeVendors,
      totalCustomers,
      totalDeliveryMen,
      totalProducts,
      pendingProducts,
      activeProducts,
      lowStockProducts,
      commissionAggregate,
      vendorEarningAggregate,
      paidPayoutAggregate,
      pendingPayoutAggregate,
      codPendingAggregate,
      manualPendingAggregate,
      recentOrders,
      orderStatusBreakdown,
      paymentStatusBreakdown,
      deliveryStatusBreakdown,
    ] = await this.prisma.$transaction([
      this.prisma.payment.aggregate({
        where: { paymentStatus: PaymentStatus.PAID },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          paymentStatus: PaymentStatus.PAID,
          updatedAt: { gte: today.start, lt: today.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.order.count(),
      this.prisma.order.count({
        where: { createdAt: { gte: today.start, lt: today.end } },
      }),
      this.prisma.order.count({ where: { status: OrderStatus.PENDING } }),
      this.prisma.order.count({ where: { status: OrderStatus.DELIVERED } }),
      this.prisma.order.count({ where: { status: OrderStatus.CANCELLED } }),
      this.prisma.payment.count({
        where: { paymentStatus: PaymentStatus.PENDING_VERIFICATION },
      }),
      this.prisma.payment.count({ where: { paymentStatus: PaymentStatus.PAID } }),
      this.prisma.withdrawalRequest.count({
        where: { status: WithdrawalStatus.PENDING },
      }),
      this.prisma.user.count({ where: { role: UserRole.VENDOR } }),
      this.prisma.store.count({
        where: { verificationStatus: StoreVerificationStatus.PENDING },
      }),
      this.prisma.store.count({
        where: {
          status: StoreStatus.ACTIVE,
          verificationStatus: StoreVerificationStatus.VERIFIED,
        },
      }),
      this.prisma.user.count({ where: { role: UserRole.CUSTOMER } }),
      this.prisma.user.count({ where: { role: UserRole.DELIVERY_MAN } }),
      this.prisma.product.count(),
      this.prisma.product.count({
        where: { status: ProductStatus.PENDING_REVIEW },
      }),
      this.prisma.product.count({ where: { status: ProductStatus.ACTIVE } }),
      this.prisma.product.count({
        where: { stock: { lte: this.lowStockThreshold } },
      }),
      this.prisma.orderItem.aggregate({
        where: { order: paidOrderWhere },
        _sum: { commissionAmount: true },
      }),
      this.prisma.orderItem.aggregate({
        where: { order: paidOrderWhere },
        _sum: { vendorEarning: true },
      }),
      this.prisma.withdrawalRequest.aggregate({
        where: { status: WithdrawalStatus.PAID },
        _sum: { amount: true },
      }),
      this.prisma.withdrawalRequest.aggregate({
        where: {
          status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED] },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          paymentMethod: PaymentMethod.COD,
          paymentStatus: PaymentStatus.PENDING_VERIFICATION,
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          paymentMethod: {
            in: [PaymentMethod.MANUAL_BKASH, PaymentMethod.MANUAL_NAGAD],
          },
          paymentStatus: PaymentStatus.PENDING_VERIFICATION,
        },
        _sum: { amount: true },
      }),
      this.prisma.order.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.orderSummaryInclude(),
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['paymentStatus'],
        orderBy: { paymentStatus: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['deliveryStatus'],
        orderBy: { deliveryStatus: 'asc' },
        _count: { _all: true },
      }),
    ]);

    return {
      overview: {
        totalRevenue: this.decimal(totalRevenue._sum.amount),
        todayRevenue: this.decimal(todayRevenue._sum.amount),
        totalOrders,
        todayOrders,
        pendingOrders,
        deliveredOrders,
        cancelledOrders,
        pendingPayments,
        paidPayments,
        pendingPayouts,
        totalVendors,
        pendingVendors,
        activeVendors,
        totalCustomers,
        totalDeliveryMen,
        totalProducts,
        pendingProducts,
        activeProducts,
        lowStockProducts,
      },
      finance: {
        totalCommissionEarned: this.decimal(
          commissionAggregate._sum.commissionAmount,
        ),
        totalVendorEarning: this.decimal(vendorEarningAggregate._sum.vendorEarning),
        totalPayoutPaid: this.decimal(paidPayoutAggregate._sum.amount),
        totalPendingPayout: this.decimal(pendingPayoutAggregate._sum.amount),
        codPendingVerification: this.decimal(codPendingAggregate._sum.amount),
        manualPaymentPendingVerification: this.decimal(
          manualPendingAggregate._sum.amount,
        ),
      },
      recentOrders,
      topProducts: await this.getTopProducts({ range, limit }),
      topVendors: await this.getTopVendors({ range, limit }),
      orderStatusBreakdown: this.formatBreakdown(orderStatusBreakdown, 'status'),
      paymentStatusBreakdown: this.formatBreakdown(
        paymentStatusBreakdown,
        'paymentStatus',
      ),
      deliveryStatusBreakdown: this.formatBreakdown(
        deliveryStatusBreakdown,
        'deliveryStatus',
      ),
      salesChart: await this.getSalesChart({ range }),
    };
  }

  async getVendorDashboard(vendorId: string, query: DashboardQueryDto) {
    const range = this.resolveDateRange(query);
    const limit = this.resolveLimit(query.limit);
    const orderWhere = { items: { some: { vendorId } } };
    const [
      totalProducts,
      activeProducts,
      pendingProducts,
      rejectedProducts,
      lowStockProductsCount,
      totalOrders,
      pendingOrders,
      processingOrders,
      deliveredOrders,
      cancelledOrders,
      wallet,
      pendingPayouts,
      totalCommissionPaid,
      recentOrders,
      orderStatusBreakdown,
      lowStockProducts,
    ] = await this.prisma.$transaction([
      this.prisma.product.count({ where: { vendorId } }),
      this.prisma.product.count({
        where: { vendorId, status: ProductStatus.ACTIVE },
      }),
      this.prisma.product.count({
        where: { vendorId, status: ProductStatus.PENDING_REVIEW },
      }),
      this.prisma.product.count({
        where: { vendorId, status: ProductStatus.REJECTED },
      }),
      this.prisma.product.count({
        where: { vendorId, stock: { lte: this.lowStockThreshold } },
      }),
      this.prisma.order.count({ where: orderWhere }),
      this.prisma.order.count({
        where: { ...orderWhere, status: OrderStatus.PENDING },
      }),
      this.prisma.order.count({
        where: { ...orderWhere, status: OrderStatus.PROCESSING },
      }),
      this.prisma.order.count({
        where: { ...orderWhere, status: OrderStatus.DELIVERED },
      }),
      this.prisma.order.count({
        where: { ...orderWhere, status: OrderStatus.CANCELLED },
      }),
      this.prisma.wallet.findUnique({ where: { vendorId } }),
      this.prisma.withdrawalRequest.count({
        where: {
          wallet: { vendorId },
          status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED] },
        },
      }),
      this.prisma.orderItem.aggregate({
        where: { vendorId, order: { paymentStatus: PaymentStatus.PAID } },
        _sum: { commissionAmount: true },
      }),
      this.prisma.order.findMany({
        where: orderWhere,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.vendorOrderInclude(vendorId),
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: orderWhere,
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.product.findMany({
        where: { vendorId, stock: { lte: this.lowStockThreshold } },
        take: limit,
        orderBy: { stock: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          stock: true,
          status: true,
          images: true,
        },
      }),
    ]);

    return {
      overview: {
        totalProducts,
        activeProducts,
        pendingProducts,
        rejectedProducts,
        lowStockProducts: lowStockProductsCount,
        totalOrders,
        pendingOrders,
        processingOrders,
        deliveredOrders,
        cancelledOrders,
      },
      finance: {
        availableBalance: this.decimal(wallet?.balance),
        pendingBalance: this.decimal(wallet?.pendingBalance),
        totalEarned: this.decimal(wallet?.totalEarned),
        totalWithdrawn: this.decimal(wallet?.totalWithdrawn),
        pendingPayouts,
        totalCommissionPaid: this.decimal(
          totalCommissionPaid._sum.commissionAmount,
        ),
      },
      recentOrders,
      topProducts: await this.getTopProducts({ range, limit, vendorId }),
      lowStockProducts,
      salesChart: await this.getSalesChart({ range, vendorId }),
      orderStatusBreakdown: this.formatBreakdown(orderStatusBreakdown, 'status'),
    };
  }

  async getCustomerDashboard(customerId: string, query: DashboardQueryDto) {
    const limit = this.resolveLimit(query.limit);
    const [
      totalOrders,
      pendingOrders,
      deliveredOrders,
      cancelledOrders,
      cartItems,
      recentOrders,
      pendingPayments,
      recommendedProducts,
    ] = await this.prisma.$transaction([
      this.prisma.order.count({ where: { customerId } }),
      this.prisma.order.count({
        where: { customerId, status: OrderStatus.PENDING },
      }),
      this.prisma.order.count({
        where: { customerId, status: OrderStatus.DELIVERED },
      }),
      this.prisma.order.count({
        where: { customerId, status: OrderStatus.CANCELLED },
      }),
      this.prisma.cartItem.count({
        where: { cart: { customerId } },
      }),
      this.prisma.order.findMany({
        where: { customerId },
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.orderSummaryInclude(),
      }),
      this.prisma.payment.findMany({
        where: {
          order: { customerId },
          paymentStatus: PaymentStatus.PENDING_VERIFICATION,
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderId: true,
          paymentMethod: true,
          paymentStatus: true,
          amount: true,
          rejectionReason: true,
          createdAt: true,
          order: {
            select: {
              orderNumber: true,
              total: true,
            },
          },
        },
      }),
      this.prisma.product.findMany({
        where: {
          status: ProductStatus.ACTIVE,
          stock: { gt: 0 },
          store: {
            status: StoreStatus.ACTIVE,
            verificationStatus: StoreVerificationStatus.VERIFIED,
          },
          OR: [
            { categoryId: null },
            { category: { status: CategoryStatus.ACTIVE } },
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          discountPrice: true,
          images: true,
          avgRating: true,
          reviewsCount: true,
        },
      }),
    ]);

    return {
      overview: {
        totalOrders,
        pendingOrders,
        deliveredOrders,
        cancelledOrders,
        wishlistItems: 0,
        cartItems,
      },
      recentOrders,
      pendingPayments,
      recommendedProducts,
    };
  }

  private async getTopProducts({
    range,
    limit,
    vendorId,
  }: {
    range: DateRange;
    limit: number;
    vendorId?: string;
  }) {
    const grouped = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        vendorId,
        order: {
          paymentStatus: PaymentStatus.PAID,
          createdAt: { gte: range.start, lt: range.end },
        },
      },
      _sum: {
        quantity: true,
        subtotal: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: limit,
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: grouped.map((item) => item.productId) } },
      select: {
        id: true,
        name: true,
        slug: true,
        images: true,
      },
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    return grouped.map((item) => {
      const product = productById.get(item.productId);

      return {
        productId: item.productId,
        productName: product?.name ?? 'Unknown product',
        productSlug: product?.slug ?? null,
        productImage: product?.images[0] ?? null,
        quantitySold: item._sum.quantity ?? 0,
        revenue: this.decimal(item._sum.subtotal),
      };
    });
  }

  private async getTopVendors({
    range,
    limit,
  }: {
    range: DateRange;
    limit: number;
  }) {
    const grouped = await this.prisma.orderItem.groupBy({
      by: ['vendorId'],
      where: {
        order: {
          paymentStatus: PaymentStatus.PAID,
          createdAt: { gte: range.start, lt: range.end },
        },
      },
      _sum: {
        quantity: true,
        vendorEarning: true,
        commissionAmount: true,
      },
      orderBy: {
        _sum: {
          vendorEarning: 'desc',
        },
      },
      take: limit,
    });
    const vendors = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((item) => item.vendorId) } },
      select: {
        id: true,
        name: true,
        email: true,
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
    const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));

    return grouped.map((item) => {
      const vendor = vendorById.get(item.vendorId);

      return {
        vendorId: item.vendorId,
        vendorName: vendor?.name ?? 'Unknown vendor',
        store: vendor?.store ?? null,
        quantitySold: item._sum.quantity ?? 0,
        vendorEarning: this.decimal(item._sum.vendorEarning),
        commissionAmount: this.decimal(item._sum.commissionAmount),
      };
    });
  }

  private async getSalesChart({
    range,
    vendorId,
  }: {
    range: DateRange;
    vendorId?: string;
  }) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        vendorId,
        order: {
          paymentStatus: PaymentStatus.PAID,
          createdAt: { gte: range.start, lt: range.end },
        },
      },
      select: {
        quantity: true,
        subtotal: true,
        commissionAmount: true,
        vendorEarning: true,
        order: {
          select: {
            createdAt: true,
            id: true,
          },
        },
      },
    });
    const chart = new Map<
      string,
      {
        date: string;
        orderIds: Set<string>;
        revenue: Prisma.Decimal;
        commission: Prisma.Decimal;
        vendorEarning: Prisma.Decimal;
      }
    >();

    for (const item of items) {
      const date = item.order.createdAt.toISOString().slice(0, 10);
      const current =
        chart.get(date) ??
        {
          date,
          orderIds: new Set<string>(),
          revenue: new Prisma.Decimal(0),
          commission: new Prisma.Decimal(0),
          vendorEarning: new Prisma.Decimal(0),
        };

      current.orderIds.add(item.order.id);
      current.revenue = current.revenue.add(item.subtotal);
      current.commission = current.commission.add(item.commissionAmount);
      current.vendorEarning = current.vendorEarning.add(item.vendorEarning);
      chart.set(date, current);
    }

    return Array.from(chart.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        date: item.date,
        orders: item.orderIds.size,
        revenue: this.decimal(item.revenue),
        commission: this.decimal(item.commission),
        vendorEarning: this.decimal(item.vendorEarning),
      }));
  }

  private orderSummaryInclude() {
    return {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
        },
      },
      payment: true,
      deliveryZone: true,
      items: {
        take: 5,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              images: true,
            },
          },
          store: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    } as const;
  }

  private vendorOrderInclude(vendorId: string) {
    return {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      payment: true,
      deliveryZone: true,
      items: {
        where: { vendorId },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              images: true,
            },
          },
          store: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    } as const;
  }

  private formatBreakdown<T extends Record<string, unknown>>(
    items: T[],
    key: keyof T,
  ) {
    return items.map((item) => ({
      status: item[key],
      count:
        (item._count as { _all?: number } | undefined)?._all ??
        (item._count as number | undefined) ??
        0,
    }));
  }

  private resolveDateRange(query: DashboardQueryDto): DateRange {
    if (query.period === DashboardPeriod.CUSTOM && query.startDate && query.endDate) {
      const start = new Date(query.startDate);
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    const end = new Date();
    const start = new Date(end);

    switch (query.period) {
      case DashboardPeriod.TODAY:
        return this.getDayRange(end);
      case DashboardPeriod.WEEK:
        start.setDate(end.getDate() - 7);
        break;
      case DashboardPeriod.YEAR:
        start.setFullYear(end.getFullYear() - 1);
        break;
      case DashboardPeriod.MONTH:
      default:
        start.setDate(end.getDate() - 30);
        break;
    }

    return { start, end };
  }

  private getDayRange(date: Date): DateRange {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    return { start, end };
  }

  private resolveLimit(limit?: number) {
    return Math.min(Math.max(Number(limit) || 10, 1), 50);
  }

  private decimal(value?: Prisma.Decimal | number | string | null) {
    return new Prisma.Decimal(value ?? 0).toDecimalPlaces(2).toNumber();
  }
}
