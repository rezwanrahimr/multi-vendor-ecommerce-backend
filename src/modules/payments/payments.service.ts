import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  NotificationType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildPaginationMeta,
  getPagination,
} from '../../utils/pagination.util';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';
import { SubmitManualPaymentDto } from './dto/submit-manual-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async submitManualPayment(
    customerId: string,
    orderId: string,
    dto: SubmitManualPaymentDto,
  ) {
    this.assertManualPaymentMethod(dto.paymentMethod);

    const order = await this.prisma.order.findFirstOrThrow({
      where: { id: orderId, customerId },
      include: { payment: true },
    });

    if (
      ([OrderStatus.CANCELLED, OrderStatus.RETURNED] as OrderStatus[]).includes(
        order.status,
      )
    ) {
      throw new BadRequestException('Payment cannot be submitted for this order');
    }

    if (!order.payment) {
      throw new BadRequestException('Payment record was not initialized');
    }

    if (order.payment.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('This order payment is already paid');
    }

    if (order.payment.paymentStatus === PaymentStatus.PENDING_VERIFICATION) {
      throw new ConflictException('Payment proof is already pending review');
    }

    if (!new Prisma.Decimal(dto.amount).eq(order.total)) {
      throw new BadRequestException('Submitted payment amount must match order total');
    }

    await this.assertTransactionIdAvailable(dto.transactionId, order.payment.id);

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: { id: order.payment!.id },
        data: {
          paymentMethod: dto.paymentMethod,
          paymentStatus: PaymentStatus.PENDING_VERIFICATION,
          transactionId: dto.transactionId,
          senderPhone: dto.senderPhone,
          paymentScreenshotUrl: dto.paymentScreenshotUrl,
          paymentScreenshotPublicId: dto.paymentScreenshotPublicId,
          amount: order.total,
          metadata: dto.note ? { note: dto.note } : undefined,
          reviewedById: null,
          reviewedAt: null,
          rejectionReason: null,
        },
        include: this.defaultInclude(),
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentMethod: dto.paymentMethod,
          paymentStatus: PaymentStatus.PENDING_VERIFICATION,
        },
      });

      await this.notificationsService.create(
        {
          userId: customerId,
          title: 'Payment submitted',
          message: `Payment proof for order ${order.orderNumber} is pending review.`,
          type: NotificationType.PAYMENT_SUBMITTED,
          data: { paymentId: payment.id, orderId: order.id },
        },
        tx,
      );

      return payment;
    });
  }

  async findAll(query: PaymentQueryDto) {
    const pagination = getPagination({ page: query.page, limit: query.limit });
    const where = this.buildPaymentWhere(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: this.defaultInclude(),
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  async getAdminSummary(query: PaymentQueryDto = {}) {
    const baseWhere = this.buildPaymentWhere(query, { omitStatus: true });
    const [
      totalPayments,
      verifiedPayments,
      pendingPayments,
      rejectedPayments,
      unpaidPayments,
      failedPayments,
      refundedPayments,
    ] = await this.prisma.$transaction([
      this.prisma.payment.count({ where: baseWhere }),
      this.prisma.payment.count({
        where: {
          ...baseWhere,
          paymentStatus: PaymentStatus.PAID,
        },
      }),
      this.prisma.payment.count({
        where: {
          ...baseWhere,
          paymentStatus: PaymentStatus.PENDING_VERIFICATION,
        },
      }),
      this.prisma.payment.count({
        where: {
          ...baseWhere,
          paymentStatus: PaymentStatus.REJECTED,
        },
      }),
      this.prisma.payment.count({
        where: {
          ...baseWhere,
          paymentStatus: PaymentStatus.UNPAID,
        },
      }),
      this.prisma.payment.count({
        where: {
          ...baseWhere,
          paymentStatus: PaymentStatus.FAILED,
        },
      }),
      this.prisma.payment.count({
        where: {
          ...baseWhere,
          paymentStatus: PaymentStatus.REFUNDED,
        },
      }),
    ]);

    return {
      totalPayments: this.buildSummaryMetric(totalPayments, totalPayments),
      verifiedPayments: this.buildSummaryMetric(verifiedPayments, totalPayments),
      pendingPayments: this.buildSummaryMetric(pendingPayments, totalPayments),
      rejectedPayments: this.buildSummaryMetric(rejectedPayments, totalPayments),
      statusBreakdown: {
        all: totalPayments,
        paid: verifiedPayments,
        pendingVerification: pendingPayments,
        rejected: rejectedPayments,
        unpaid: unpaidPayments,
        failed: failedPayments,
        refunded: refundedPayments,
      },
    };
  }

  findOne(id: string) {
    return this.prisma.payment.findUniqueOrThrow({
      where: { id },
      include: this.defaultInclude(),
    });
  }

  async findCustomerOrderPayment(customerId: string, orderId: string) {
    const payment = await this.prisma.payment.findFirstOrThrow({
      where: {
        orderId,
        order: {
          customerId,
        },
      },
      select: {
        id: true,
        orderId: true,
        paymentMethod: true,
        paymentStatus: true,
        amount: true,
        transactionId: true,
        senderPhone: true,
        paymentScreenshotUrl: true,
        cashCollectedAmount: true,
        cashCollectedAt: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
      },
    });

    return payment;
  }

  async verify(id: string, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id },
        include: { order: true },
      });

      this.assertPendingVerification(payment.paymentStatus);

      if (
        ![
          PaymentMethod.COD,
          PaymentMethod.MANUAL_BKASH,
          PaymentMethod.MANUAL_NAGAD,
        ].includes(payment.paymentMethod)
      ) {
        throw new BadRequestException('Unsupported payment method');
      }

      if (payment.paymentMethod === PaymentMethod.COD) {
        this.assertCodReadyForVerification(payment);
      } else {
        this.assertManualReadyForVerification(payment);
      }

      const updatedPayment = await tx.payment.update({
        where: { id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          reviewedById: adminId,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
        include: this.defaultInclude(),
      });

      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: PaymentStatus.PAID },
      });

      if (payment.customerId) {
        await this.notificationsService.create(
          {
            userId: payment.customerId,
            title: 'Payment verified',
            message: `Payment for order ${payment.order.orderNumber} was verified.`,
            type: NotificationType.PAYMENT_VERIFIED,
            data: { paymentId: id, orderId: payment.orderId },
          },
          tx,
        );
      }

      await this.auditLogsService.log(
        {
          actorId: adminId,
          action: 'PAYMENT_VERIFIED',
          entityType: 'Payment',
          entityId: id,
          metadata: { orderId: payment.orderId, amount: payment.amount.toNumber() },
        },
        tx,
      );

      return updatedPayment;
    });
  }

  verifyCodByOrder(orderId: string, adminId: string) {
    return this.prisma.payment
      .findUniqueOrThrow({
        where: { orderId },
        select: { id: true },
      })
      .then((payment) => this.verify(payment.id, adminId));
  }

  async reject(id: string, adminId: string, dto: RejectPaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id },
        include: { order: { select: { orderNumber: true } } },
      });

      this.assertPendingVerification(payment.paymentStatus);

      const updatedPayment = await tx.payment.update({
        where: { id },
        data: {
          paymentStatus: PaymentStatus.REJECTED,
          reviewedById: adminId,
          reviewedAt: new Date(),
          rejectionReason: dto.rejectionReason,
        },
        include: this.defaultInclude(),
      });

      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: PaymentStatus.REJECTED },
      });

      if (payment.customerId) {
        await this.notificationsService.create(
          {
            userId: payment.customerId,
            title: 'Payment rejected',
            message: `Payment for order ${payment.order.orderNumber} was rejected.`,
            type: NotificationType.PAYMENT_REJECTED,
            data: { paymentId: id, orderId: payment.orderId },
          },
          tx,
        );
      }

      await this.auditLogsService.log(
        {
          actorId: adminId,
          action: 'PAYMENT_REJECTED',
          entityType: 'Payment',
          entityId: id,
          metadata: {
            orderId: payment.orderId,
            reason: dto.rejectionReason,
          },
        },
        tx,
      );

      return updatedPayment;
    });
  }

  handleWebhook(_dto: PaymentWebhookDto) {
    throw new BadRequestException(
      'Automatic payment webhooks are disabled. Use manual admin verification.',
    );
  }

  private buildPaymentWhere(
    query: PaymentQueryDto,
    options: { omitStatus?: boolean } = {},
  ): Prisma.PaymentWhereInput {
    const search = query.search?.trim();
    const createdAt = this.buildCreatedAtFilter(query);

    return {
      paymentStatus: options.omitStatus ? undefined : query.paymentStatus,
      paymentMethod: query.paymentMethod,
      orderId: query.orderId,
      customerId: query.customerId,
      transactionId: query.transactionId
        ? { contains: query.transactionId, mode: 'insensitive' }
        : undefined,
      createdAt,
      OR: search
        ? [
            { transactionId: { contains: search, mode: 'insensitive' } },
            { senderPhone: { contains: search, mode: 'insensitive' } },
            { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            { customer: { email: { contains: search, mode: 'insensitive' } } },
            { customer: { phone: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
  }

  private defaultInclude() {
    return {
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          deliveryStatus: true,
          total: true,
          paymentMethod: true,
          paymentStatus: true,
          shippingAddress: true,
          deliveryMan: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          deliveryZone: true,
        },
      },
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      cashCollectedBy: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      reviewedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    } as const;
  }

  private assertManualPaymentMethod(paymentMethod: PaymentMethod) {
    if (
      !(
        [
          PaymentMethod.MANUAL_BKASH,
          PaymentMethod.MANUAL_NAGAD,
        ] as PaymentMethod[]
      ).includes(paymentMethod)
    ) {
      throw new BadRequestException('Only manual bKash or Nagad payments are accepted');
    }
  }

  private assertPendingVerification(paymentStatus: PaymentStatus) {
    if (paymentStatus !== PaymentStatus.PENDING_VERIFICATION) {
      throw new BadRequestException('Payment must be pending verification');
    }
  }

  private async assertTransactionIdAvailable(
    transactionId: string,
    currentPaymentId: string,
  ) {
    const existing = await this.prisma.payment.findFirst({
      where: {
        transactionId,
        id: { not: currentPaymentId },
        paymentStatus: {
          in: [PaymentStatus.PENDING_VERIFICATION, PaymentStatus.PAID],
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('This transaction ID has already been submitted');
    }
  }

  private assertManualReadyForVerification(payment: {
    transactionId: string | null;
    senderPhone: string | null;
  }) {
    if (!payment.transactionId || !payment.senderPhone) {
      throw new BadRequestException('Manual payment proof is incomplete');
    }
  }

  private assertCodReadyForVerification(payment: {
    cashCollectedAmount: Prisma.Decimal | null;
    amount: Prisma.Decimal;
    order: { status: OrderStatus; total: Prisma.Decimal };
  }) {
    if (payment.order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('COD payment can be verified only after delivery');
    }

    if (!payment.cashCollectedAmount) {
      throw new BadRequestException('COD cash collection has not been recorded');
    }

    if (!new Prisma.Decimal(payment.cashCollectedAmount).eq(payment.order.total)) {
      throw new BadRequestException('COD cash collection amount does not match order total');
    }
  }

  private buildSummaryMetric(value: number, total: number) {
    return {
      value,
      percentageOfTotal:
        total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0,
    };
  }

  private buildCreatedAtFilter(query: PaymentQueryDto) {
    if (query.dateFrom || query.dateTo) {
      return {
        gte: query.dateFrom ? this.startOfDay(new Date(query.dateFrom)) : undefined,
        lte: query.dateTo ? this.endOfDay(new Date(query.dateTo)) : undefined,
      };
    }

    if (query.date) {
      const range = this.getDayBounds(new Date(query.date));

      return {
        gte: range.start,
        lt: range.end,
      };
    }

    return undefined;
  }

  private startOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private endOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
  }

  private getDayBounds(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    return { start, end };
  }
}
