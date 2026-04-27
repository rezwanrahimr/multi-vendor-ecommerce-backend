import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { buildPaginationMeta, getPagination } from '../../utils/pagination.util';
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

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: dto.items.map((item) => item.productId) },
      },
      select: {
        id: true,
        vendorId: true,
        price: true,
        discountPrice: true,
        stock: true,
      },
    });

    if (products.length !== dto.items.length) {
      throw new BadRequestException('One or more products are unavailable');
    }

    const orderItems = dto.items.map((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);

      if (!product || product.stock < item.quantity) {
        throw new BadRequestException('Product stock is not sufficient');
      }

      const unitPrice = product.discountPrice ?? product.price;
      const totalPrice = new Prisma.Decimal(unitPrice).mul(item.quantity);

      return {
        productId: product.id,
        vendorId: product.vendorId,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
      };
    });

    const subtotal = orderItems.reduce(
      (sum, item) => sum.add(item.totalPrice),
      new Prisma.Decimal(0),
    );
    const deliveryFee = new Prisma.Decimal(dto.deliveryFee ?? 0);
    const discountAmount = new Prisma.Decimal(dto.discountAmount ?? 0);
    const total = subtotal.add(deliveryFee).sub(discountAmount);

    return this.prisma.order.create({
      data: {
        orderNumber: this.createOrderNumber(),
        customerId,
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
      include: this.defaultInclude(),
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
    return this.prisma.order.update({
      where: { id },
      data: dto,
      include: this.defaultInclude(),
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
      items: {
        include: {
          product: true,
        },
      },
      payment: true,
    } as const;
  }
}
