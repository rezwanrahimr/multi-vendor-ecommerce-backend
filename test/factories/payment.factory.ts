import { PaymentMethod, PaymentStatus, PrismaClient } from '@prisma/client';
import { createOrder } from './order.factory';

type PaymentFactoryOverrides = {
  id?: string;
  orderId?: string;
  customerId?: string | null;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  transactionId?: string | null;
  senderPhone?: string | null;
  amount?: number;
  cashCollectedAmount?: number | null;
};

export async function createPayment(
  prisma: PrismaClient,
  overrides: PaymentFactoryOverrides = {},
) {
  const order = overrides.orderId
    ? null
    : await createOrder(prisma);

  return prisma.payment.create({
    data: {
      orderId: overrides.orderId ?? order!.id,
      customerId: overrides.customerId ?? order?.customerId,
      paymentMethod: PaymentMethod.COD,
      paymentStatus: PaymentStatus.UNPAID,
      amount: order?.total ?? 250,
      ...overrides,
    },
  });
}
