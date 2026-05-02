import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommissionType,
  DeliveryStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  StockLogType,
  WalletTransactionType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  buildPaginationMeta,
  getPagination,
} from '../../utils/pagination.util';
import { AssignDeliveryManDto } from './dto/assign-delivery-man.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Injectable()
export class OrdersService {
  private static readonly ORDER_TRANSACTION_TIMEOUT_MS = 15000;

  constructor(private readonly prisma: PrismaService) {}

  async create(customerId: string, dto: CreateOrderDto) {
    if (dto.items.length === 0) {
      throw new BadRequestException('Order must include at least one product');
    }

    const orderId = await this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: {
          id: { in: dto.items.map((item) => item.productId) },
        },
        select: {
          id: true,
          vendorId: true,
          storeId: true,
          price: true,
          discountPrice: true,
          stock: true,
          store: {
            select: {
              commissionRate: true,
            },
          },
        },
      });

      if (products.length !== dto.items.length) {
        throw new BadRequestException('One or more products are unavailable');
      }

      const orderItems = dto.items.map((item) => {
        const product = products.find(
          (candidate) => candidate.id === item.productId,
        );

        if (!product || product.stock < item.quantity) {
          throw new BadRequestException('Product stock is not sufficient');
        }

        const unitPrice = product.discountPrice ?? product.price;
        const totalPrice = new Prisma.Decimal(unitPrice).mul(item.quantity);
        const adminCommission = totalPrice
          .mul(product.store.commissionRate)
          .div(100)
          .toDecimalPlaces(2);
        const vendorEarning = totalPrice.sub(adminCommission);

        return {
          productId: product.id,
          vendorId: product.vendorId,
          storeId: product.storeId,
          quantity: item.quantity,
          unitPrice,
          priceSnapshot: unitPrice,
          totalPrice,
          subtotal: totalPrice,
          commissionType: CommissionType.PERCENTAGE,
          commissionValue: product.store.commissionRate,
          adminCommission,
          commissionAmount: adminCommission,
          vendorEarning,
        };
      });

      const subtotal = orderItems.reduce(
        (sum, item) => sum.add(item.totalPrice),
        new Prisma.Decimal(0),
      );
      const deliveryCharge = await this.resolveDeliveryCharge(tx, dto, subtotal);
      const discountAmount = new Prisma.Decimal(0);
      const total = subtotal.add(deliveryCharge).sub(discountAmount);

      const order = await tx.order.create({
        data: {
          orderNumber: this.createOrderNumber(),
          customerId,
          deliveryZoneId: dto.deliveryZoneId ?? dto.deliveryAreaId,
          paymentMethod: dto.paymentMethod ?? PaymentMethod.COD,
          subtotal,
          deliveryCharge,
          discountAmount,
          total,
          shippingAddress: dto.shippingAddress as Prisma.InputJsonValue,
          customerNote: dto.customerNote,
          items: {
            create: orderItems,
          },
        },
      });

      await this.decrementProductStock(tx, orderItems, order.id, customerId);

      return order.id;
    }, {
      timeout: OrdersService.ORDER_TRANSACTION_TIMEOUT_MS,
    });

    return this.findOne(orderId);
  }

  async findAll(page?: number, limit?: number) {
    const pagination = getPagination({ page, limit });
    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: this.defaultInclude(),
      }),
      this.prisma.order.count(),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  findCustomerOrders(customerId: string) {
    return this.prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: this.defaultInclude(),
    });
  }

  findOne(id: string) {
    return this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: this.defaultInclude(),
    });
  }

  updateStatus(id: string, dto: UpdateOrderStatusDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: dto,
      });

      if (dto.status === OrderStatus.DELIVERED) {
        await this.settleDeliveredOrder(tx, id);
      }

      return tx.order.findUniqueOrThrow({
        where: { id },
        include: this.defaultInclude(),
      });
    });
  }

  updateAssignedDeliveryStatus(
    orderId: string,
    deliveryManId: string,
    status: OrderStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: {
          id: orderId,
          deliveryManId,
        },
        data: {
          status,
        },
      });

      if (result.count === 0) {
        throw new NotFoundException('Assigned order was not found');
      }

      if (status === OrderStatus.DELIVERED) {
        await this.settleDeliveredOrder(tx, orderId);
      }

      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: this.defaultInclude(),
      });
    });
  }

  assignDeliveryMan(id: string, dto: AssignDeliveryManDto) {
    return this.prisma.order.update({
      where: { id },
      data: {
        deliveryManId: dto.deliveryManId,
        deliveryStatus: DeliveryStatus.ASSIGNED,
        status: OrderStatus.ASSIGNED_TO_DELIVERY,
      },
      include: this.defaultInclude(),
    });
  }

  private createOrderNumber() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `HF-${timestamp}-${random}`;
  }

  private defaultInclude() {
    return {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      deliveryMan: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      deliveryZone: true,
      items: {
        include: {
          product: true,
          store: true,
        },
      },
      payment: true,
    } as const;
  }

  private async resolveDeliveryCharge(
    tx: Prisma.TransactionClient,
    dto: CreateOrderDto,
    subtotal: Prisma.Decimal,
  ) {
    const deliveryZoneId = dto.deliveryZoneId ?? dto.deliveryAreaId;

    if (!deliveryZoneId) {
      throw new BadRequestException('Delivery zone is required');
    }

    const deliveryZone = await tx.deliveryZone.findUnique({
      where: { id: deliveryZoneId },
      select: {
        baseCharge: true,
        freeDeliveryMinAmount: true,
        isActive: true,
      },
    });

    if (!deliveryZone || !deliveryZone.isActive) {
      throw new BadRequestException('Selected delivery zone is unavailable');
    }

    if (
      deliveryZone.freeDeliveryMinAmount &&
      subtotal.gte(deliveryZone.freeDeliveryMinAmount)
    ) {
      return new Prisma.Decimal(0);
    }

    return deliveryZone.baseCharge;
  }

  private async decrementProductStock(
    tx: Prisma.TransactionClient,
    items: {
      productId: string;
      storeId: string;
      quantity: number;
    }[],
    orderId: string,
    customerId: string,
  ) {
    for (const item of items) {
      const result = await tx.product.updateMany({
        where: {
          id: item.productId,
          stock: {
            gte: item.quantity,
          },
        },
        data: {
          stock: {
            decrement: item.quantity,
          },
        },
      });

      if (result.count === 0) {
        throw new BadRequestException('Product stock is not sufficient');
      }
    }

    const updatedProducts = await tx.product.findMany({
      where: {
        id: { in: items.map((item) => item.productId) },
      },
      select: {
        id: true,
        stock: true,
      },
    });
    const stockByProductId = new Map(
      updatedProducts.map((product) => [product.id, product.stock]),
    );

    await tx.stockLog.createMany({
      data: items.map((item) => {
        const newStock = stockByProductId.get(item.productId);

        if (newStock === undefined) {
          throw new BadRequestException('One or more products are unavailable');
        }

        return {
          productId: item.productId,
          storeId: item.storeId,
          changedById: customerId,
          type: StockLogType.DECREASE,
          quantity: item.quantity,
          previousStock: newStock + item.quantity,
          newStock,
          reason: 'ORDER_PLACED',
          reference: orderId,
        };
      }),
    });
  }

  private async settleDeliveredOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ) {
    const settlement = await tx.order.updateMany({
      where: {
        id: orderId,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID,
        vendorSettledAt: null,
      },
      data: {
        vendorSettledAt: new Date(),
      },
    });

    if (settlement.count === 0) {
      return;
    }

    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: {
        vendorId: true,
        vendorEarning: true,
      },
    });

    const earningsByVendor = new Map<string, Prisma.Decimal>();

    for (const item of items) {
      const current =
        earningsByVendor.get(item.vendorId) ?? new Prisma.Decimal(0);
      earningsByVendor.set(item.vendorId, current.add(item.vendorEarning));
    }

    for (const [vendorId, amount] of earningsByVendor.entries()) {
      if (amount.lte(0)) {
        continue;
      }

      const wallet = await tx.wallet.upsert({
        where: { vendorId },
        update: {
          balance: {
            increment: amount,
          },
        },
        create: {
          vendorId,
          balance: amount,
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.CREDIT,
          amount,
          reference: orderId,
          reason: 'Order delivered vendor earning',
          metadata: {
            orderId,
            vendorId,
          },
        },
      });
    }
  }
}
