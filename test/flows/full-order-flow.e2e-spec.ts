import { INestApplication } from '@nestjs/common';
import {
  CommissionType,
  DeliveryStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  ProductStatus,
  WithdrawalStatus,
} from '@prisma/client';
import * as request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { createCategory, createDeliveryZone, createProduct, createStore } from '../factories';
import {
  createAdminAuth,
  createCustomerAuth,
  createDeliveryManAuth,
  createVendorAuth,
} from '../helpers/auth.helper';
import { createE2eApp } from '../helpers/e2e-app';
import { resetDatabase } from '../helpers/reset-db';

describe('Full COD order, delivery, wallet, and payout flow (e2e)', () => {
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

  it('completes COD order lifecycle and payout without double-crediting wallet', async () => {
    const admin = await createAdminAuth(app, prisma);
    const customer = await createCustomerAuth(app, prisma);
    const vendor = await createVendorAuth(app, prisma);
    const deliveryMan = await createDeliveryManAuth(app, prisma);
    const store = await createStore(prisma, { vendorId: vendor.user.id });
    const category = await createCategory(prisma);
    const deliveryZone = await createDeliveryZone(prisma);

    await request(app.getHttpServer())
      .post('/api/v1/admin/commission-rules')
      .set('Authorization', admin.authorization)
      .send({
        commissionType: CommissionType.PERCENTAGE,
        commissionValue: 10,
        priority: 5,
      })
      .expect(201);

    const pendingProduct = await createProduct(prisma, {
      vendorId: vendor.user.id,
      storeId: store.id,
      categoryId: category.id,
      price: 200,
      stock: 20,
      status: ProductStatus.PENDING_REVIEW,
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/products/${pendingProduct.id}/approve`)
      .set('Authorization', admin.authorization)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', customer.authorization)
      .send({ productId: pendingProduct.id, quantity: 2 })
      .expect(201);

    const checkoutResponse = await request(app.getHttpServer())
      .post('/api/v1/checkout/calculate')
      .set('Authorization', customer.authorization)
      .send({ deliveryZoneId: deliveryZone.id })
      .expect(201);

    expect(checkoutResponse.body.data.summary).toMatchObject({
      subtotal: 400,
      deliveryCharge: 50,
      grandTotal: 450,
      totalQuantity: 2,
    });

    const orderResponse = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', customer.authorization)
      .send({
        deliveryZoneId: deliveryZone.id,
        paymentMethod: PaymentMethod.COD,
        shippingAddress: {
          fullName: 'Customer One',
          phone: '01700000000',
          addressLine: 'Feni Sadar',
        },
      })
      .expect(201);
    const order = orderResponse.body.data;

    await expect(
      prisma.product.findUniqueOrThrow({ where: { id: pendingProduct.id } }),
    ).resolves.toMatchObject({ stock: 18 });
    await expect(
      prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } }),
    ).resolves.toMatchObject({
      paymentMethod: PaymentMethod.COD,
      paymentStatus: PaymentStatus.UNPAID,
    });

    for (const status of [
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.READY_FOR_PICKUP,
    ]) {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${order.id}/status`)
        .set('Authorization', admin.authorization)
        .send({ status })
        .expect(200);
    }

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/assign-delivery`)
      .set('Authorization', admin.authorization)
      .send({ deliveryManId: deliveryMan.user.id })
      .expect(200);

    for (const deliveryStatus of [
      DeliveryStatus.ACCEPTED,
      DeliveryStatus.PICKED_UP,
      DeliveryStatus.OUT_FOR_DELIVERY,
    ]) {
      await request(app.getHttpServer())
        .patch(`/api/v1/delivery/orders/${order.id}/status`)
        .set('Authorization', deliveryMan.authorization)
        .send({ deliveryStatus })
        .expect(200);
    }

    await request(app.getHttpServer())
      .patch(`/api/v1/delivery/orders/${order.id}/status`)
      .set('Authorization', deliveryMan.authorization)
      .send({
        deliveryStatus: DeliveryStatus.DELIVERED,
        cashCollectedAmount: 450,
        note: 'Collected COD cash',
      })
      .expect(200);

    await expect(
      prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } }),
    ).resolves.toMatchObject({
      paymentStatus: PaymentStatus.PENDING_VERIFICATION,
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/verify-cod-payment`)
      .set('Authorization', admin.authorization)
      .expect(200);

    const settlementResponse = await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${order.id}/settle-wallet`)
      .set('Authorization', admin.authorization)
      .expect(201);

    expect(settlementResponse.body.data.settled[0]).toMatchObject({
      vendorId: vendor.user.id,
      vendorEarning: 360,
      commissionAmount: 40,
    });

    const duplicateSettlementResponse = await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${order.id}/settle-wallet`)
      .set('Authorization', admin.authorization)
      .expect(201);

    expect(duplicateSettlementResponse.body.data.settled).toHaveLength(0);
    await expect(
      prisma.wallet.findUniqueOrThrow({ where: { vendorId: vendor.user.id } }),
    ).resolves.toMatchObject({
      balance: expect.anything(),
      totalEarned: expect.anything(),
    });

    const payoutResponse = await request(app.getHttpServer())
      .post('/api/v1/vendor/payouts')
      .set('Authorization', vendor.authorization)
      .send({
        amount: 100,
        method: 'BKASH',
        accountNumber: '01700000000',
        accountName: 'Vendor One',
      })
      .expect(201);
    const payout = payoutResponse.body.data;

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/payouts/${payout.id}/approve`)
      .set('Authorization', admin.authorization)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/payouts/${payout.id}/mark-paid`)
      .set('Authorization', admin.authorization)
      .send({ transactionId: 'PAYOUT-TX-1', adminNote: 'Paid by bKash' })
      .expect(200);

    await expect(
      prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: payout.id } }),
    ).resolves.toMatchObject({
      status: WithdrawalStatus.PAID,
      payoutTransactionId: 'PAYOUT-TX-1',
    });
  });
});
