import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  findAssignedOrders(deliveryManId: string) {
    return this.prisma.order.findMany({
      where: {
        deliveryManId,
        status: {
          in: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SHIPPED],
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
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
      },
    });
  }

  async updateDeliveryStatus(orderId: string, deliveryManId: string, dto: UpdateDeliveryStatusDto) {
    const result = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        deliveryManId,
      },
      data: {
        status: dto.status,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Assigned order was not found');
    }

    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  }
}
