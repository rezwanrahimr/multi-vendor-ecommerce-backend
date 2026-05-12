import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CategoryStatus,
  DeliveryStatus,
  NotificationType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ProductStatus,
  StockLogType,
  StoreStatus,
  StoreVerificationStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  buildPaginationMeta,
  getPagination,
} from '../../utils/pagination.util';
import { CommissionsService } from '../commissions/commissions.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CouponsService } from '../coupons/coupons.service';
import { DeliveryType } from '../delivery-zones/dto/calculate-delivery-charge.dto';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AssignDeliveryManDto } from './dto/assign-delivery-man.dto';
import { CreateOrderDto, CreateOrderItemDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.READY_FOR_PICKUP]: [
    OrderStatus.ASSIGNED_TO_DELIVERY,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.ASSIGNED_TO_DELIVERY]: [
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.OUT_FOR_DELIVERY]: [
    OrderStatus.DELIVERED,
    OrderStatus.RETURNED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.RETURNED]: [],
};

@Injectable()
export class OrdersService {
  private static readonly ORDER_TRANSACTION_TIMEOUT_MS = 15000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryZonesService: DeliveryZonesService,
    private readonly commissionsService: CommissionsService,
    private readonly couponsService: CouponsService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(customerId: string, dto: CreateOrderDto) {
    const createdFromCart = !dto.items || dto.items.length === 0;
    const orderId = await this.prisma.$transaction(
      async (tx) => {
        const requestedItems = await this.resolveRequestedItems(
          tx,
          customerId,
          dto.items,
        );
        const products = await this.getCheckoutProducts(tx, requestedItems);
        const orderItems = [];
        const couponItems = [];
        let subtotal = new Prisma.Decimal(0);

        for (const item of requestedItems) {
          const product = products.get(item.productId);

          if (!product) {
            throw new BadRequestException('One or more products are unavailable');
          }

          this.assertOrderableProduct(product);
          this.assertQuantityAvailable(product.stock, item.quantity);

          if (!product.categoryId) {
            throw new BadRequestException(
              'Selected product category is unavailable',
            );
          }

          const unitPrice = this.getProductUnitPrice(product).toDecimalPlaces(2);
          const itemSubtotal = unitPrice.mul(item.quantity).toDecimalPlaces(2);
          const commission = await this.commissionsService.calculateCommission({
            vendorId: product.vendorId,
            categoryId: product.categoryId,
            productId: product.id,
            price: unitPrice,
            quantity: item.quantity,
          });

          subtotal = subtotal.add(itemSubtotal);
          couponItems.push({
            productId: product.id,
            vendorId: product.vendorId,
            categoryId: product.categoryId,
          });
          orderItems.push({
            productId: product.id,
            vendorId: product.vendorId,
            storeId: product.storeId,
            productName: product.name,
            quantity: item.quantity,
            unitPrice,
            priceSnapshot: unitPrice,
            totalPrice: itemSubtotal,
            subtotal: itemSubtotal,
            commissionType: commission.commissionType,
            commissionRuleId: commission.ruleId,
            commissionSource: commission.source,
            commissionValue: new Prisma.Decimal(commission.commissionValue),
            adminCommission: new Prisma.Decimal(commission.commissionAmount),
            commissionAmount: new Prisma.Decimal(commission.commissionAmount),
            vendorEarning: new Prisma.Decimal(commission.vendorEarning),
          });
        }

        const deliveryType = dto.deliveryType ?? DeliveryType.NORMAL;
        const delivery = await this.deliveryZonesService.calculateCharge(
          dto.deliveryZoneId,
          subtotal,
          deliveryType,
        );
        const deliveryCharge = new Prisma.Decimal(delivery.deliveryCharge);
        const coupon = await this.couponsService.calculateDiscountWithClient(tx, {
          customerId,
          couponCode: dto.couponCode,
          subtotal,
          deliveryCharge,
          items: couponItems,
        });
        const discountAmount = coupon?.discountAmount ?? new Prisma.Decimal(0);
        const total = Prisma.Decimal.max(
          subtotal.add(deliveryCharge).sub(discountAmount),
          0,
        );
        const paymentStatus = this.getInitialPaymentStatus(dto.paymentMethod);

        const order = await tx.order.create({
          data: {
            orderNumber: this.createOrderNumber(),
            customerId,
            deliveryZoneId: dto.deliveryZoneId,
            deliveryType,
            paymentMethod: dto.paymentMethod,
            paymentStatus,
            status: OrderStatus.PENDING,
            deliveryStatus: DeliveryStatus.NOT_ASSIGNED,
            subtotal,
            deliveryCharge,
            discountAmount,
            couponId: coupon?.couponId,
            couponCode: coupon?.couponCode,
            couponDiscountType: coupon?.discountType,
            total,
            shippingAddress: dto.shippingAddress as Prisma.InputJsonValue,
            customerNote: dto.customerNote,
            items: {
              create: orderItems,
            },
          },
        });

        await tx.payment.create({
          data: {
            orderId: order.id,
            customerId,
            paymentMethod: dto.paymentMethod,
            paymentStatus,
            amount: total,
          },
        });

        if (dto.couponCode) {
          await this.couponsService.consumeCoupon(tx, {
            customerId,
            couponCode: dto.couponCode,
            subtotal,
            deliveryCharge,
            items: couponItems,
            orderId: order.id,
          });
        }

        await this.decrementProductStock(tx, orderItems, order.id, customerId);

        if (createdFromCart) {
          await tx.cartItem.deleteMany({
            where: {
              cart: {
                customerId,
              },
            },
          });
        }

        await this.notificationsService.create(
          {
            userId: customerId,
            title: 'Order created',
            message: `Order ${order.orderNumber} has been created.`,
            type: NotificationType.ORDER_CREATED,
            data: { orderId: order.id, orderNumber: order.orderNumber },
          },
          tx,
        );

        return order.id;
      },
      {
        timeout: OrdersService.ORDER_TRANSACTION_TIMEOUT_MS,
      },
    );

    return this.findCustomerOrder(customerId, orderId);
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

  findOne(id: string) {
    return this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: this.defaultInclude(),
    });
  }

  findCustomerOrders(customerId: string) {
    return this.prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: this.defaultInclude(),
    });
  }

  findCustomerOrder(customerId: string, id: string) {
    return this.prisma.order.findFirstOrThrow({
      where: { id, customerId },
      include: this.defaultInclude(),
    });
  }

  findVendorOrders(vendorId: string) {
    return this.prisma.order.findMany({
      where: {
        items: {
          some: { vendorId },
        },
      },
      orderBy: { createdAt: 'desc' },
      include: this.vendorInclude(vendorId),
    });
  }

  findVendorOrder(vendorId: string, id: string) {
    return this.prisma.order.findFirstOrThrow({
      where: {
        id,
        items: {
          some: { vendorId },
        },
      },
      include: this.vendorInclude(vendorId),
    });
  }

  updateStatus(id: string, dto: UpdateOrderStatusDto, actorId?: string) {
    return this.updateOrderLifecycle(id, dto, UserRole.ADMIN, actorId);
  }

  async updateVendorStatus(
    vendorId: string,
    id: string,
    dto: UpdateOrderStatusDto,
  ) {
    await this.assertVendorOrder(vendorId, id);
    return this.updateOrderLifecycle(id, dto, UserRole.VENDOR, vendorId);
  }

  async cancelCustomerOrder(customerId: string, id: string) {
    const order = await this.prisma.order.findFirstOrThrow({
      where: { id, customerId },
      select: { status: true },
    });

    if (order.status !== OrderStatus.PENDING) {
      throw new ForbiddenException(
        'Customers can cancel only before order confirmation',
      );
    }

    return this.updateOrderLifecycle(
      id,
      { status: OrderStatus.CANCELLED },
      UserRole.CUSTOMER,
      customerId,
    );
  }

  updateAssignedDeliveryStatus(
    orderId: string,
    deliveryManId: string,
    status: OrderStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const debug = (msg: string) => {
        if (process.env.DEBUG_TX === 'true') console.log(msg);
      };

      debug(`tx:start:updateAssigned:${orderId}`);
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          deliveryManId,
        },
        include: this.defaultInclude(),
      });

      debug(`tx:after:findAssigned:${orderId}`);

      if (!order) {
        throw new NotFoundException('Assigned order was not found');
      }

      this.assertTransition(order.status, status, UserRole.DELIVERY_MAN);

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status },
        include: this.defaultInclude(),
      });

      debug(`tx:after:updateAssigned:${orderId}`);

      return updated;
    });
  }

  async assignDeliveryMan(id: string, dto: AssignDeliveryManDto, actorId?: string) {
    const deliveryMan = await this.prisma.user.findFirst({
      where: {
        id: dto.deliveryManId,
        role: UserRole.DELIVERY_MAN,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!deliveryMan) {
      throw new BadRequestException('Selected delivery man is unavailable');
    }

    return this.prisma.$transaction(async (tx) => {
      const debug = (msg: string) => {
        if (process.env.DEBUG_TX === 'true') console.log(msg);
      };

      debug(`tx:start:assignDelivery:${id}`);

      const order = await tx.order.findUniqueOrThrow({
        where: { id },
        select: { status: true, customerId: true, orderNumber: true },
      });

      debug(`tx:after:findAssign:${id}`);

      if (order.status !== OrderStatus.READY_FOR_PICKUP) {
        throw new BadRequestException(
          'Order must be ready for pickup before delivery assignment',
        );
      }

      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          deliveryManId: dto.deliveryManId,
          deliveryStatus: DeliveryStatus.ASSIGNED,
          status: OrderStatus.ASSIGNED_TO_DELIVERY,
        },
        include: this.defaultInclude(),
      });

      debug(`tx:after:updateAssign:${id}`);

      debug(`tx:before:notifyDelivery:${id}`);
      await this.notificationsService.create(
        {
          userId: dto.deliveryManId,
          title: 'Delivery assigned',
          message: `Order ${order.orderNumber} has been assigned to you.`,
          type: NotificationType.DELIVERY_ASSIGNED,
          data: { orderId: id, orderNumber: order.orderNumber },
        },
        tx,
      );
      debug(`tx:after:notifyDelivery:${id}`);

      debug(`tx:before:notifyCustomer:${id}`);
      await this.notificationsService.create(
        {
          userId: order.customerId,
          title: 'Delivery assigned',
          message: `A delivery person has been assigned to order ${order.orderNumber}.`,
          type: NotificationType.DELIVERY_ASSIGNED,
          data: { orderId: id, orderNumber: order.orderNumber },
        },
        tx,
      );
      debug(`tx:after:notifyCustomer:${id}`);


      debug(`tx:before:auditAssign:${id}`);
      await this.auditLogsService.log(
        {
          actorId,
          action: 'DELIVERY_ASSIGNED',
          entityType: 'Order',
          entityId: id,
          metadata: { deliveryManId: dto.deliveryManId },
        },
        tx,
      );
      debug(`tx:after:auditAssign:${id}`);

      return updatedOrder;
    });
  }

  private async updateOrderLifecycle(
    id: string,
    dto: UpdateOrderStatusDto,
    actorRole: UserRole,
    actorId?: string,
  ) {
    if (!dto.status && !dto.deliveryStatus) {
      throw new BadRequestException('No status change was provided');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id },
        include: {
          items: true,
        },
      });
      const nextStatus = dto.status ?? order.status;

      if (dto.status) {
        this.assertTransition(order.status, dto.status, actorRole);
      }

      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          status: dto.status,
          deliveryStatus: dto.deliveryStatus,
        },
        include: this.defaultInclude(),
      });

      if (
        nextStatus === OrderStatus.CANCELLED &&
        order.status !== OrderStatus.CANCELLED
      ) {
        await this.restoreCancelledOrderStock(tx, order.items, id);
      }

      if (dto.status && dto.status !== order.status) {
        await this.notificationsService.create(
          {
            userId: order.customerId,
            title: 'Order status updated',
            message: `Order ${order.orderNumber} is now ${dto.status}.`,
            type: NotificationType.ORDER_STATUS_UPDATED,
            data: { orderId: id, status: dto.status },
          },
          tx,
        );

        await this.auditLogsService.log(
          {
            actorId,
            action: 'ORDER_STATUS_CHANGED',
            entityType: 'Order',
            entityId: id,
            metadata: {
              from: order.status,
              to: dto.status,
              actorRole,
            },
          },
          tx,
        );
      }

      return updatedOrder;
    });
  }

  private async resolveRequestedItems(
    tx: Prisma.TransactionClient,
    customerId: string,
    items?: CreateOrderItemDto[],
  ) {
    const sourceItems = items ?? (await this.getCartItems(tx, customerId));
    const merged = new Map<string, number>();

    for (const item of sourceItems) {
      merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    }

    const resolvedItems = Array.from(merged.entries()).map(
      ([productId, quantity]) => ({ productId, quantity }),
    );

    if (resolvedItems.length < 1) {
      throw new BadRequestException('Order must include at least one product');
    }

    return resolvedItems;
  }

  private async getCartItems(tx: Prisma.TransactionClient, customerId: string) {
    const cart = await tx.cart.findUnique({
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

  private async getCheckoutProducts(
    tx: Prisma.TransactionClient,
    items: { productId: string; quantity: number }[],
  ) {
    const products = await tx.product.findMany({
      where: { id: { in: items.map((item) => item.productId) } },
      include: {
        category: {
          select: {
            status: true,
          },
        },
        store: {
          select: {
            status: true,
            verificationStatus: true,
            vendor: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    });

    if (products.length !== items.length) {
      throw new BadRequestException('One or more products are unavailable');
    }

    return new Map(products.map((product) => [product.id, product]));
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

  private vendorInclude(vendorId: string) {
    return {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      deliveryZone: true,
      items: {
        where: { vendorId },
        include: {
          product: true,
          store: true,
        },
      },
      payment: true,
    } as const;
  }

  private assertOrderableProduct(product: {
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

  private assertTransition(
    current: OrderStatus,
    next: OrderStatus,
    actorRole: UserRole,
  ) {
    if (current === next) {
      return;
    }

    if (
      actorRole === UserRole.ADMIN &&
      next === OrderStatus.CANCELLED &&
      !(
        [
          OrderStatus.DELIVERED,
          OrderStatus.CANCELLED,
          OrderStatus.RETURNED,
        ] as OrderStatus[]
      ).includes(current)
    ) {
      return;
    }

    const allowed = ORDER_TRANSITIONS[current] ?? [];

    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Order status cannot move from ${current} to ${next}`,
      );
    }

    if (
      actorRole === UserRole.VENDOR &&
      !(
        [
          OrderStatus.CONFIRMED,
          OrderStatus.PROCESSING,
          OrderStatus.READY_FOR_PICKUP,
          OrderStatus.CANCELLED,
        ] as OrderStatus[]
      ).includes(next)
    ) {
      throw new ForbiddenException('Vendor cannot set this order status');
    }

    if (actorRole === UserRole.CUSTOMER && next !== OrderStatus.CANCELLED) {
      throw new ForbiddenException('Customer can only cancel an order');
    }
  }

  private async assertVendorOrder(vendorId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        items: {
          some: { vendorId },
        },
      },
      select: { id: true },
    });

    if (!order) {
      throw new NotFoundException('Order was not found');
    }
  }

  private getInitialPaymentStatus(paymentMethod: PaymentMethod) {
    if (paymentMethod === PaymentMethod.COD) {
      return PaymentStatus.UNPAID;
    }

    return PaymentStatus.PENDING_VERIFICATION;
  }

  private getProductUnitPrice(product: {
    price: Prisma.Decimal;
    discountPrice: Prisma.Decimal | null;
  }) {
    return new Prisma.Decimal(product.discountPrice ?? product.price);
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

    await tx.product.updateMany({
      where: {
        id: { in: items.map((item) => item.productId) },
        stock: 0,
      },
      data: { status: ProductStatus.OUT_OF_STOCK },
    });
  }

  private async restoreCancelledOrderStock(
    tx: Prisma.TransactionClient,
    items: {
      productId: string;
      storeId: string;
      quantity: number;
    }[],
    orderId: string,
  ) {
    for (const item of items) {
      const product = await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: {
            increment: item.quantity,
          },
          status: ProductStatus.ACTIVE,
        },
        select: {
          id: true,
          stock: true,
        },
      });

      await tx.stockLog.create({
        data: {
          productId: item.productId,
          storeId: item.storeId,
          type: StockLogType.INCREASE,
          quantity: item.quantity,
          previousStock: product.stock - item.quantity,
          newStock: product.stock,
          reason: 'ORDER_CANCELLED',
          reference: orderId,
        },
      });
    }
  }
}
