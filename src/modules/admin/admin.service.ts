import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardOverview() {
    const [
      totalUsers,
      totalVendors,
      activeUsers,
      activeVendors,
      pendingOrders,
      completeOrders,
      cancelOrders,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({
        where: { role: UserRole.CUSTOMER },
      }),
      this.prisma.user.count({
        where: { role: UserRole.VENDOR },
      }),
      this.prisma.user.count({
        where: {
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
        },
      }),
      this.prisma.user.count({
        where: {
          role: UserRole.VENDOR,
          status: UserStatus.ACTIVE,
        },
      }),
      this.prisma.order.count({
        where: { status: OrderStatus.PENDING },
      }),
      this.prisma.order.count({
        where: { status: OrderStatus.DELIVERED },
      }),
      this.prisma.order.count({
        where: { status: OrderStatus.CANCELLED },
      }),
    ]);

    return {
      totalUsers,
      totalVendors,
      activeUsers,
      activeVendors,
      pendingOrders,
      completeOrders,
      cancelOrders,
    };
  }
}