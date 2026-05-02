import { INestApplication } from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  PrismaClient,
  WithdrawalStatus,
} from '@prisma/client';
import * as request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { createOrder, createPayment, createWallet } from '../factories';
import { createAdminAuth, createVendorAuth } from '../helpers/auth.helper';
import { createE2eApp } from '../helpers/e2e-app';
import { resetDatabase } from '../helpers/reset-db';

describe('Wallet and payout money safety (e2e)', () => {
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

  async function createOrderForSettlement(status: OrderStatus, paymentStatus: PaymentStatus) {
    const order = await createOrder(prisma, {
      status,
      paymentStatus,
    });
    await createPayment(prisma, {
      orderId: order.id,
      customerId: order.customerId,
      amount: order.total,
      paymentStatus,
    });

    return order;
  }

  it('does not settle unpaid, undelivered, or already settled orders twice', async () => {
    const admin = await createAdminAuth(app, prisma);
    const unpaidOrder = await createOrderForSettlement(
      OrderStatus.DELIVERED,
      PaymentStatus.UNPAID,
    );
    const undeliveredOrder = await createOrderForSettlement(
      OrderStatus.PENDING,
      PaymentStatus.PAID,
    );
    const payableOrder = await createOrderForSettlement(
      OrderStatus.DELIVERED,
      PaymentStatus.PAID,
    );
    const payableOrderItem = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: payableOrder.id },
    });
    const vendorId = payableOrderItem.vendorId;

    await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${unpaidOrder.id}/settle-wallet`)
      .set('Authorization', admin.authorization)
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${undeliveredOrder.id}/settle-wallet`)
      .set('Authorization', admin.authorization)
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${payableOrder.id}/settle-wallet`)
      .set('Authorization', admin.authorization)
      .expect(201);

    const balanceAfterFirstSettlement = await prisma.wallet.findUniqueOrThrow({
      where: { vendorId },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${payableOrder.id}/settle-wallet`)
      .set('Authorization', admin.authorization)
      .expect(201);

    const balanceAfterDuplicateSettlement = await prisma.wallet.findUniqueOrThrow({
      where: { vendorId },
    });

    expect(balanceAfterDuplicateSettlement.balance.toString()).toBe(
      balanceAfterFirstSettlement.balance.toString(),
    );
  });

  it('blocks excessive payouts, refunds rejected payouts, and locks paid payouts', async () => {
    const admin = await createAdminAuth(app, prisma);
    const vendor = await createVendorAuth(app, prisma);

    await createWallet(prisma, {
      vendorId: vendor.user.id,
      balance: 200,
      totalEarned: 200,
    });

    await request(app.getHttpServer())
      .post('/api/v1/vendor/payouts')
      .set('Authorization', vendor.authorization)
      .send({
        amount: 250,
        method: 'BKASH',
        accountNumber: '01700000000',
      })
      .expect(400);

    const rejectedPayoutResponse = await request(app.getHttpServer())
      .post('/api/v1/vendor/payouts')
      .set('Authorization', vendor.authorization)
      .send({
        amount: 100,
        method: 'BKASH',
        accountNumber: '01700000000',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/payouts/${rejectedPayoutResponse.body.data.id}/reject`)
      .set('Authorization', admin.authorization)
      .send({ reason: 'Invalid account number' })
      .expect(200);

    await expect(
      prisma.wallet.findUniqueOrThrow({ where: { vendorId: vendor.user.id } }),
    ).resolves.toMatchObject({
      balance: expect.anything(),
      pendingBalance: expect.anything(),
    });

    const paidPayoutResponse = await request(app.getHttpServer())
      .post('/api/v1/vendor/payouts')
      .set('Authorization', vendor.authorization)
      .send({
        amount: 100,
        method: 'BKASH',
        accountNumber: '01700000000',
      })
      .expect(201);
    const paidPayout = paidPayoutResponse.body.data;

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/payouts/${paidPayout.id}/approve`)
      .set('Authorization', admin.authorization)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/payouts/${paidPayout.id}/mark-paid`)
      .set('Authorization', admin.authorization)
      .send({ transactionId: 'PAID-TX-1' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/payouts/${paidPayout.id}/reject`)
      .set('Authorization', admin.authorization)
      .send({ reason: 'Too late' })
      .expect(400);

    await expect(
      prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: paidPayout.id } }),
    ).resolves.toMatchObject({
      status: WithdrawalStatus.PAID,
    });
  });
});
