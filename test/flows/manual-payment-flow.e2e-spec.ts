import { INestApplication } from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
} from '@prisma/client';
import * as request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { createOrder, createPayment } from '../factories';
import { createAdminAuth, createCustomerAuth } from '../helpers/auth.helper';
import { createE2eApp } from '../helpers/e2e-app';
import { resetDatabase } from '../helpers/reset-db';

describe('Manual bKash/Nagad payment verification (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createUnpaidCustomerOrder(customerId: string) {
    const order = await createOrder(prisma, { customerId });
    await createPayment(prisma, {
      orderId: order.id,
      customerId,
      amount: order.total,
      paymentMethod: PaymentMethod.COD,
      paymentStatus: PaymentStatus.UNPAID,
    });

    return order;
  }

  it('validates manual proof amount, duplicate transaction IDs, rejection, resubmission, and verification', async () => {
    const admin = await createAdminAuth(app, prisma);
    const customer = await createCustomerAuth(app, prisma);
    const firstOrder = await createUnpaidCustomerOrder(customer.user.id);

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${firstOrder.id}/manual-payment`)
      .set('Authorization', customer.authorization)
      .send({
        paymentMethod: PaymentMethod.MANUAL_BKASH,
        transactionId: 'BKASH-TX-1',
        senderPhone: '01700000000',
        amount: 249,
      })
      .expect(400);

    const proofResponse = await request(app.getHttpServer())
      .post(`/api/v1/orders/${firstOrder.id}/manual-payment`)
      .set('Authorization', customer.authorization)
      .send({
        paymentMethod: PaymentMethod.MANUAL_BKASH,
        transactionId: 'BKASH-TX-1',
        senderPhone: '01700000000',
        amount: 250,
        note: 'Paid manually',
      })
      .expect(201);

    expect(proofResponse.body.data).toMatchObject({
      paymentMethod: PaymentMethod.MANUAL_BKASH,
      paymentStatus: PaymentStatus.PENDING_VERIFICATION,
      transactionId: 'BKASH-TX-1',
    });

    const secondOrder = await createUnpaidCustomerOrder(customer.user.id);

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${secondOrder.id}/manual-payment`)
      .set('Authorization', customer.authorization)
      .send({
        paymentMethod: PaymentMethod.MANUAL_NAGAD,
        transactionId: 'BKASH-TX-1',
        senderPhone: '01800000000',
        amount: 250,
      })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/payments/${proofResponse.body.data.id}/reject`)
      .set('Authorization', admin.authorization)
      .send({ rejectionReason: 'Transaction ID not found' })
      .expect(200);

    const resubmitted = await request(app.getHttpServer())
      .post(`/api/v1/orders/${firstOrder.id}/manual-payment`)
      .set('Authorization', customer.authorization)
      .send({
        paymentMethod: PaymentMethod.MANUAL_NAGAD,
        transactionId: 'NAGAD-TX-1',
        senderPhone: '01800000000',
        amount: 250,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/payments/${resubmitted.body.data.id}/verify`)
      .set('Authorization', admin.authorization)
      .expect(200);

    await expect(
      prisma.payment.findUniqueOrThrow({ where: { orderId: firstOrder.id } }),
    ).resolves.toMatchObject({
      paymentStatus: PaymentStatus.PAID,
      transactionId: 'NAGAD-TX-1',
    });
  });

  it('settles wallet only after order is both delivered and paid', async () => {
    const admin = await createAdminAuth(app, prisma);
    const customer = await createCustomerAuth(app, prisma);
    const order = await createUnpaidCustomerOrder(customer.user.id);

    await prisma.payment.update({
      where: { orderId: order.id },
      data: { paymentStatus: PaymentStatus.PAID },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: PaymentStatus.PAID },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${order.id}/settle-wallet`)
      .set('Authorization', admin.authorization)
      .expect(400);

    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.DELIVERED },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${order.id}/settle-wallet`)
      .set('Authorization', admin.authorization)
      .expect(201);
  });
});
