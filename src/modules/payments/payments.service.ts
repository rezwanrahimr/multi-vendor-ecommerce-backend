import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePaymentDto) {
    const payment = await this.prisma.payment.create({
      data: {
        orderId: dto.orderId,
        paymentMethod: dto.paymentMethod,
        transactionId: dto.transactionId,
        senderPhone: dto.senderPhone,
        paymentScreenshotUrl: dto.paymentScreenshotUrl,
        paymentScreenshotPublicId: dto.paymentScreenshotPublicId,
        amount: dto.amount,
        paymentStatus: dto.paymentStatus,
        rejectionReason: dto.rejectionReason,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
      include: { order: true },
    });

    if (payment.paymentStatus === PaymentStatus.PAID) {
      await this.prisma.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: PaymentStatus.PAID },
      });
    }

    return payment;
  }

  findAll() {
    return this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      include: { order: true },
    });
  }

  findOne(id: string) {
    return this.prisma.payment.findUniqueOrThrow({
      where: { id },
      include: { order: true },
    });
  }

  async handleWebhook(dto: PaymentWebhookDto) {
    const payment = await this.prisma.payment.update({
      where: { transactionId: dto.transactionId },
      data: {
        paymentStatus: dto.paymentStatus,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
      include: { order: true },
    });

    await this.prisma.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: dto.paymentStatus },
    });

    return payment;
  }
}
