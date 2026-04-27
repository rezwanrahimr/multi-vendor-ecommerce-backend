import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryAreaStatus,
  OrderStatus,
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
  constructor(private readonly prisma: PrismaService) {}

  async create(customerId: string, dto: CreateOrderDto) {
    if (dto.items.length === 0) {
      throw new BadRequestException('Order must include at least one product');
    }

    return this.prisma.$transaction(async (tx) => {
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
          totalPrice,
          adminCommission,
          vendorEarning,
        };
      });

      const subtotal = orderItems.reduce(
        (sum, item) => sum.add(item.totalPrice),
        new Prisma.Decimal(0),
      );
      const deliveryFee = await this.resolveDeliveryFee(tx, dto);
      const discountAmount = new Prisma.Decimal(dto.discountAmount ?? 0);
      const total = subtotal.add(deliveryFee).sub(discountAmount);

      const order = await tx.order.create({
        data: {
          orderNumber: this.createOrderNumber(),
          customerId,
          deliveryAreaId: dto.deliveryAreaId,
          subtotal,
          deliveryFee,
          discountAmount,
          total,
          shippingAddress: dto.shippingAddress as Prisma.InputJsonValue,
          customerNote: dto.customerNote,
          items: {
            create: orderItems,
          },
        },
      });

      for (const item of orderItems) {
        await this.decrementProductStock(tx, item, order.id, customerId);
      }

      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: this.defaultInclude(),
      });
    });
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
      data: { deliveryManId: dto.deliveryManId },
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
      deliveryArea: true,
      items: {
        include: {
          product: true,
          store: true,
        },
      },
      payment: true,
    } as const;
  }

  private async resolveDeliveryFee(
    tx: Prisma.TransactionClient,
    dto: CreateOrderDto,
  ) {
    if (!dto.deliveryAreaId) {
      return new Prisma.Decimal(dto.deliveryFee ?? 0);
    }

    const deliveryArea = await tx.deliveryArea.findUnique({
      where: { id: dto.deliveryAreaId },
      select: {
        fee: true,
        status: true,
      },
    });

    if (!deliveryArea || deliveryArea.status !== DeliveryAreaStatus.ACTIVE) {
      throw new BadRequestException('Selected delivery area is unavailable');
    }

    return deliveryArea.fee;
  }

  private async decrementProductStock(
    tx: Prisma.TransactionClient,
    item: {
      productId: string;
      storeId: string;
      quantity: number;
    },
    orderId: string,
    customerId: string,
  ) {
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

    const product = await tx.product.findUniqueOrThrow({
      where: { id: item.productId },
      select: { stock: true },
    });

    await tx.stockLog.create({
      data: {
        productId: item.productId,
        storeId: item.storeId,
        changedById: customerId,
        type: StockLogType.DECREASE,
        quantity: item.quantity,
        previousStock: product.stock + item.quantity,
        newStock: product.stock,
        reason: 'ORDER_PLACED',
        reference: orderId,
      },
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
