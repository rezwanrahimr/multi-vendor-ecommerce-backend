import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService manual payment safety', () => {
  const prisma = {
    order: {
      findFirstOrThrow: jest.fn(),
    },
    payment: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const notificationsService = {
    create: jest.fn(),
  };
  const auditLogsService = {
    log: jest.fn(),
  };

  let service: PaymentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentsService(
      prisma as never,
      notificationsService as never,
      auditLogsService as never,
    );
  });

  it('rejects unsupported customer payment methods', async () => {
    await expect(
      service.submitManualPayment('customer-1', 'order-1', {
        paymentMethod: PaymentMethod.COD,
        transactionId: 'TX123',
        senderPhone: '01700000000',
        amount: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.order.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it('rejects manual payment proof when amount does not match order total', async () => {
    prisma.order.findFirstOrThrow.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.PENDING,
      total: new Prisma.Decimal(100),
      payment: {
        id: 'payment-1',
        paymentStatus: PaymentStatus.UNPAID,
      },
    });

    await expect(
      service.submitManualPayment('customer-1', 'order-1', {
        paymentMethod: PaymentMethod.MANUAL_BKASH,
        transactionId: 'TX123',
        senderPhone: '01700000000',
        amount: 99,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.payment.findFirst).not.toHaveBeenCalled();
  });

  it('rejects duplicate submission while a payment is pending review', async () => {
    prisma.order.findFirstOrThrow.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.PENDING,
      total: new Prisma.Decimal(100),
      payment: {
        id: 'payment-1',
        paymentStatus: PaymentStatus.PENDING_VERIFICATION,
      },
    });

    await expect(
      service.submitManualPayment('customer-1', 'order-1', {
        paymentMethod: PaymentMethod.MANUAL_NAGAD,
        transactionId: 'TX123',
        senderPhone: '01700000000',
        amount: 100,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('builds admin summary metrics with percentages', async () => {
    prisma.$transaction.mockResolvedValue([12, 8, 2, 1, 1, 0, 0]);

    await expect(service.getAdminSummary({})).resolves.toEqual({
      totalPayments: {
        value: 12,
        percentageOfTotal: 100,
      },
      verifiedPayments: {
        value: 8,
        percentageOfTotal: 66.7,
      },
      pendingPayments: {
        value: 2,
        percentageOfTotal: 16.7,
      },
      rejectedPayments: {
        value: 1,
        percentageOfTotal: 8.3,
      },
      statusBreakdown: {
        all: 12,
        paid: 8,
        pendingVerification: 2,
        rejected: 1,
        unpaid: 1,
        failed: 0,
        refunded: 0,
      },
    });
  });

  it('keeps automatic payment webhooks disabled', () => {
    expect(() => service.handleWebhook({} as never)).toThrow(BadRequestException);
  });
});
