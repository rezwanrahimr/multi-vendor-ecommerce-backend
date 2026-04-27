import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  findAssignedOrders(deliveryManId: string) {
    return this.prisma.order.findMany({
      where: {
        deliveryManId,
        status: {
          in: [
            OrderStatus.CONFIRMED,
            OrderStatus.PROCESSING,
            OrderStatus.SHIPPED,
          ],
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

  async updateDeliveryStatus(
    orderId: string,
    deliveryManId: string,
    dto: UpdateDeliveryStatusDto,
  ) {
    return this.ordersService.updateAssignedDeliveryStatus(
      orderId,
      deliveryManId,
      dto.status,
    );
  }
}
