import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryStatus,
  NotificationType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildPaginationMeta,
  getPagination,
} from '../../utils/pagination.util';
import { DeliveryOrderQueryDto } from './dto/delivery-order-query.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  [DeliveryStatus.NOT_ASSIGNED]: [DeliveryStatus.ASSIGNED],
  [DeliveryStatus.ASSIGNED]: [DeliveryStatus.ACCEPTED],
  [DeliveryStatus.ACCEPTED]: [DeliveryStatus.PICKED_UP],
  [DeliveryStatus.PICKED_UP]: [DeliveryStatus.OUT_FOR_DELIVERY],
  [DeliveryStatus.OUT_FOR_DELIVERY]: [
    DeliveryStatus.DELIVERED,
    DeliveryStatus.FAILED,
    DeliveryStatus.RETURNED,
  ],
  [DeliveryStatus.DELIVERED]: [],
  [DeliveryStatus.FAILED]: [],
  [DeliveryStatus.RETURNED]: [],
};

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getDashboard(deliveryManId: string) {
    const { start, end } = this.getDayBounds();
    const [
      assignedToday,
      pendingDeliveries,
      acceptedDeliveries,
      pickedUpDeliveries,
      outForDelivery,
      completedToday,
      failedToday,
      returnedToday,
      codToCollectOrders,
      codCollectedOrders,
      codVerifiedOrders,
      assignedOrders,
      deliveryStatusBreakdown,
    ] = await this.prisma.$transaction([
      this.prisma.order.count({
        where: {
          deliveryManId,
          deliveryStatus: DeliveryStatus.ASSIGNED,
          updatedAt: { gte: start, lt: end },
        },
      }),
      this.prisma.order.count({
        where: { deliveryManId, deliveryStatus: DeliveryStatus.ASSIGNED },
      }),
      this.prisma.order.count({
        where: { deliveryManId, deliveryStatus: DeliveryStatus.ACCEPTED },
      }),
      this.prisma.order.count({
        where: { deliveryManId, deliveryStatus: DeliveryStatus.PICKED_UP },
      }),
      this.prisma.order.count({
        where: {
          deliveryManId,
          deliveryStatus: DeliveryStatus.OUT_FOR_DELIVERY,
        },
      }),
      this.prisma.order.count({
        where: {
          deliveryManId,
          deliveryStatus: DeliveryStatus.DELIVERED,
          updatedAt: { gte: start, lt: end },
        },
      }),
      this.prisma.order.count({
        where: {
          deliveryManId,
          deliveryStatus: DeliveryStatus.FAILED,
          updatedAt: { gte: start, lt: end },
        },
      }),
      this.prisma.order.count({
        where: {
          deliveryManId,
          deliveryStatus: DeliveryStatus.RETURNED,
          updatedAt: { gte: start, lt: end },
        },
      }),
      this.prisma.order.findMany({
        where: {
          deliveryManId,
          paymentMethod: PaymentMethod.COD,
          paymentStatus: PaymentStatus.UNPAID,
          deliveryStatus: {
            in: [
              DeliveryStatus.ASSIGNED,
              DeliveryStatus.ACCEPTED,
              DeliveryStatus.PICKED_UP,
              DeliveryStatus.OUT_FOR_DELIVERY,
            ],
          },
        },
        select: { total: true },
      }),
      this.prisma.order.findMany({
        where: {
          deliveryManId,
          paymentMethod: PaymentMethod.COD,
          paymentStatus: PaymentStatus.PENDING_VERIFICATION,
          deliveryStatus: DeliveryStatus.DELIVERED,
        },
        select: {
          total: true,
          payment: {
            select: { cashCollectedAmount: true },
          },
        },
      }),
      this.prisma.order.findMany({
        where: {
          deliveryManId,
          paymentMethod: PaymentMethod.COD,
          paymentStatus: PaymentStatus.PAID,
          deliveryStatus: DeliveryStatus.DELIVERED,
        },
        select: { total: true },
      }),
      this.prisma.order.findMany({
        where: {
          deliveryManId,
          deliveryStatus: {
            in: [
              DeliveryStatus.ASSIGNED,
              DeliveryStatus.ACCEPTED,
              DeliveryStatus.PICKED_UP,
              DeliveryStatus.OUT_FOR_DELIVERY,
            ],
          },
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: this.deliveryInclude(),
      }),
      this.prisma.order.groupBy({
        by: ['deliveryStatus'],
        where: { deliveryManId },
        orderBy: { deliveryStatus: 'asc' },
        _count: { _all: true },
      }),
    ]);

    return {
      overview: {
        assignedToday,
        pendingDeliveries,
        acceptedDeliveries,
        pickedUpDeliveries,
        outForDelivery,
        completedToday,
        failedToday,
        returnedToday,
      },
      cash: {
        codCashToCollect: this.sumDecimals(
          codToCollectOrders.map((order) => order.total),
        ),
        codCashCollectedPendingVerification: this.sumDecimals(
          codCollectedOrders.map(
            (order) => order.payment?.cashCollectedAmount ?? order.total,
          ),
        ),
        codCashVerified: this.sumDecimals(
          codVerifiedOrders.map((order) => order.total),
        ),
      },
      assignedOrders,
      deliveryStatusBreakdown: deliveryStatusBreakdown.map((item) => ({
        status: item.deliveryStatus,
        count:
          (item._count as { _all?: number } | undefined)?._all ??
          0,
      })),
    };
  }

  findAssignedOrders(deliveryManId: string, query: DeliveryOrderQueryDto) {
    return this.findDeliveries({
      ...query,
      deliveryManId,
    });
  }

  async findAssignedOrder(deliveryManId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        deliveryManId,
      },
      include: this.deliveryInclude(),
    });

    if (!order) {
      throw new NotFoundException('Assigned order was not found');
    }

    return order;
  }

  findAllDeliveries(query: DeliveryOrderQueryDto) {
    return this.findDeliveries(query);
  }

  findDelivery(orderId: string) {
    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: this.deliveryInclude(),
    });
  }

  async updateDeliveryStatus(
    orderId: string,
    deliveryManId: string,
    dto: UpdateDeliveryStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          deliveryManId,
        },
        include: {
          payment: true,
        },
      });

      if (!order) {
        throw new NotFoundException('Assigned order was not found');
      }

      this.assertDeliveryCanChange(order.status, order.deliveryStatus);
      this.assertDeliveryTransition(order.deliveryStatus, dto.deliveryStatus);

      if (dto.deliveryStatus === DeliveryStatus.FAILED && !dto.failedReason) {
        throw new BadRequestException('failedReason is required for failed delivery');
      }

      const orderStatus = this.mapOrderStatus(dto.deliveryStatus, order.status);
      const paymentUpdate = this.getCodCollectionUpdate(order, deliveryManId, dto);

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          deliveryStatus: dto.deliveryStatus,
          status: orderStatus,
          deliveryNote: dto.note,
          failedReason:
            dto.deliveryStatus === DeliveryStatus.FAILED
              ? dto.failedReason
              : undefined,
          paymentStatus: paymentUpdate?.paymentStatus,
        },
        include: this.deliveryInclude(),
      });

      if (paymentUpdate) {
        await tx.payment.update({
          where: { orderId },
          data: paymentUpdate,
        });
      }

      await this.notificationsService.create(
        {
          userId: order.customerId,
          title: 'Delivery status updated',
          message: `Your delivery is now ${dto.deliveryStatus}.`,
          type: NotificationType.DELIVERY_STATUS_UPDATED,
          data: { orderId, deliveryStatus: dto.deliveryStatus },
        },
        tx,
      );

      return updatedOrder;
    });
  }

  private async findDeliveries(query: DeliveryOrderQueryDto) {
    const pagination = getPagination({ page: query.page, limit: query.limit });
    const where = this.buildDeliveryWhere(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: this.deliveryInclude(),
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  private buildDeliveryWhere(query: DeliveryOrderQueryDto): Prisma.OrderWhereInput {
    const dateRange = query.date ? this.getDayBounds(new Date(query.date)) : null;

    return {
      deliveryManId: query.deliveryManId,
      deliveryStatus: query.deliveryStatus,
      status: query.orderStatus,
      paymentMethod: query.paymentMethod,
      paymentStatus: query.paymentStatus,
      createdAt: dateRange ? { gte: dateRange.start, lt: dateRange.end } : undefined,
    };
  }

  private deliveryInclude() {
    return {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
        },
      },
      deliveryMan: {
        select: {
          id: true,
          name: true,
          phone: true,
          status: true,
        },
      },
      deliveryZone: true,
      payment: true,
      items: {
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
              phone: true,
              address: true,
            },
          },
        },
      },
    } as const;
  }

  private assertDeliveryCanChange(
    orderStatus: OrderStatus,
    deliveryStatus: DeliveryStatus,
  ) {
    if (
      (
        [
          OrderStatus.CANCELLED,
          OrderStatus.DELIVERED,
          OrderStatus.RETURNED,
        ] as OrderStatus[]
      ).includes(orderStatus) ||
      ([DeliveryStatus.DELIVERED, DeliveryStatus.RETURNED] as DeliveryStatus[]).includes(
        deliveryStatus,
      )
    ) {
      throw new BadRequestException('This delivery can no longer be updated');
    }
  }

  private assertDeliveryTransition(
    current: DeliveryStatus,
    next: DeliveryStatus,
  ) {
    if (current === next) {
      return;
    }

    const allowed = DELIVERY_TRANSITIONS[current] ?? [];

    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Delivery status cannot move from ${current} to ${next}`,
      );
    }
  }

  private mapOrderStatus(deliveryStatus: DeliveryStatus, current: OrderStatus) {
    if (deliveryStatus === DeliveryStatus.OUT_FOR_DELIVERY) {
      return OrderStatus.OUT_FOR_DELIVERY;
    }

    if (deliveryStatus === DeliveryStatus.DELIVERED) {
      return OrderStatus.DELIVERED;
    }

    if (deliveryStatus === DeliveryStatus.RETURNED) {
      return OrderStatus.RETURNED;
    }

    return current;
  }

  private getCodCollectionUpdate(
    order: {
      paymentMethod: PaymentMethod;
      paymentStatus: PaymentStatus;
      total: Prisma.Decimal;
    },
    deliveryManId: string,
    dto: UpdateDeliveryStatusDto,
  ): Prisma.PaymentUpdateInput | null {
    if (
      dto.deliveryStatus !== DeliveryStatus.DELIVERED ||
      order.paymentMethod !== PaymentMethod.COD
    ) {
      return null;
    }

    const amount = new Prisma.Decimal(dto.cashCollectedAmount ?? order.total);

    if (amount.lte(0)) {
      throw new BadRequestException('cashCollectedAmount must be greater than 0');
    }

    return {
      paymentStatus: PaymentStatus.PENDING_VERIFICATION,
      cashCollectedAmount: amount,
      cashCollectedBy: {
        connect: { id: deliveryManId },
      },
      cashCollectedAt: new Date(),
      cashCollectionNote: dto.note,
    };
  }

  private getDayBounds(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    return { start, end };
  }

  private sumDecimals(values: Array<Prisma.Decimal | number | null | undefined>) {
    const total = values.reduce<Prisma.Decimal>(
      (sum, value) => sum.add(value ?? 0),
      new Prisma.Decimal(0),
    );

    return total.toDecimalPlaces(2).toNumber();
  }
}
