import { INestApplication } from '@nestjs/common';
import {
  CouponDiscountType,
  NotificationType,
  OrderStatus,
  PaymentStatus,
  PrismaClient,
  ReviewStatus,
} from '@prisma/client';
import * as request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { createDeliveryZone, createOrder, createProduct } from '../factories';
import {
  createAdminAuth,
  createCustomerAuth,
} from '../helpers/auth.helper';
import { createE2eApp } from '../helpers/e2e-app';
import { resetDatabase } from '../helpers/reset-db';

describe('Phase 14 reviews, coupons, notifications, and audit logs (e2e)', () => {
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

  it('rejects reviews for undelivered orders, allows delivered paid orders, and blocks duplicates', async () => {
    const admin = await createAdminAuth(app, prisma);
    const customer = await createCustomerAuth(app, prisma);
    const undeliveredOrder = await createOrder(prisma, {
      customerId: customer.user.id,
      paymentStatus: PaymentStatus.PAID,
    });
    const undeliveredItem = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: undeliveredOrder.id },
    });
    const undeliveredProductId = undeliveredItem.productId;

    await request(app.getHttpServer())
      .post(`/api/v1/products/${undeliveredProductId}/reviews`)
      .set('Authorization', customer.authorization)
      .send({
        orderId: undeliveredOrder.id,
        rating: 5,
        comment: 'Not yet delivered',
      })
      .expect(400);

    const deliveredOrder = await createOrder(prisma, {
      customerId: customer.user.id,
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PAID,
    });
    const deliveredItem = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: deliveredOrder.id },
    });
    const deliveredProductId = deliveredItem.productId;

    const created = await request(app.getHttpServer())
      .post(`/api/v1/products/${deliveredProductId}/reviews`)
      .set('Authorization', customer.authorization)
      .send({
        orderId: deliveredOrder.id,
        rating: 4,
        comment: 'Good product',
      })
      .expect(201);

    expect(created.body.data).toMatchObject({
      productId: deliveredProductId,
      orderId: deliveredOrder.id,
      rating: 4,
      status: ReviewStatus.PENDING,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/products/${deliveredProductId}/reviews`)
      .set('Authorization', customer.authorization)
      .send({
        orderId: deliveredOrder.id,
        rating: 5,
      })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/reviews/${created.body.data.id}/approve`)
      .set('Authorization', admin.authorization)
      .expect(200);

    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: {
          action: 'REVIEW_APPROVED',
          entityType: 'Review',
          entityId: created.body.data.id,
        },
      }),
    ).resolves.toMatchObject({
      actorId: admin.user.id,
    });
  });

  it('calculates backend coupon discounts and rejects expired and exhausted coupons', async () => {
    const customer = await createCustomerAuth(app, prisma);
    const product = await createProduct(prisma, { price: 200, stock: 5 });
    const deliveryZone = await createDeliveryZone(prisma, { baseCharge: 50 });
    const now = new Date();

    await prisma.coupon.create({
      data: {
        code: 'SAVE10',
        title: 'Save 10 percent',
        discountType: CouponDiscountType.PERCENTAGE,
        discountValue: 10,
        maxDiscount: 30,
      },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/checkout/calculate')
      .set('Authorization', customer.authorization)
      .send({
        deliveryZoneId: deliveryZone.id,
        couponCode: 'save10',
        items: [{ productId: product.id, quantity: 2 }],
      })
      .expect(201);

    expect(response.body.data.summary).toMatchObject({
      subtotal: 400,
      deliveryCharge: 50,
      discountAmount: 30,
      grandTotal: 420,
    });
    expect(response.body.data.coupon).toMatchObject({
      code: 'SAVE10',
      discountType: CouponDiscountType.PERCENTAGE,
      discountAmount: 30,
    });

    await prisma.coupon.create({
      data: {
        code: 'OLD',
        title: 'Expired',
        discountType: CouponDiscountType.FIXED,
        discountValue: 20,
        endsAt: new Date(now.getTime() - 60_000),
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/checkout/calculate')
      .set('Authorization', customer.authorization)
      .send({
        deliveryZoneId: deliveryZone.id,
        couponCode: 'OLD',
        items: [{ productId: product.id, quantity: 1 }],
      })
      .expect(400);

    await prisma.coupon.create({
      data: {
        code: 'DONE',
        title: 'Used up',
        discountType: CouponDiscountType.FIXED,
        discountValue: 20,
        usageLimit: 1,
        usedCount: 1,
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/checkout/calculate')
      .set('Authorization', customer.authorization)
      .send({
        deliveryZoneId: deliveryZone.id,
        couponCode: 'DONE',
        items: [{ productId: product.id, quantity: 1 }],
      })
      .expect(400);
  });

  it('returns only the current user notifications', async () => {
    const customer = await createCustomerAuth(app, prisma);
    const otherCustomer = await createCustomerAuth(app, prisma);

    await prisma.notification.createMany({
      data: [
        {
          userId: customer.user.id,
          title: 'Mine',
          message: 'Visible',
          type: NotificationType.ORDER_CREATED,
        },
        {
          userId: otherCustomer.user.id,
          title: 'Other',
          message: 'Hidden',
          type: NotificationType.ORDER_CREATED,
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', customer.authorization)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      userId: customer.user.id,
      title: 'Mine',
    });
  });

  it('tracks notification unread count and read state', async () => {
    const customer = await createCustomerAuth(app, prisma);
    const notification = await prisma.notification.create({
      data: {
        userId: customer.user.id,
        title: 'Action',
        message: 'Please read',
        type: NotificationType.ORDER_STATUS_UPDATED,
      },
    });

    const unread = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', customer.authorization)
      .expect(200);

    expect(unread.body.data).toMatchObject({ count: 1 });

    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('Authorization', customer.authorization)
      .expect(200);

    const read = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', customer.authorization)
      .expect(200);

    expect(read.body.data).toMatchObject({ count: 0 });
  });

  it('keeps admin audit log list admin-only', async () => {
    const admin = await createAdminAuth(app, prisma);
    const customer = await createCustomerAuth(app, prisma);

    await prisma.auditLog.create({
      data: {
        actorId: admin.user.id,
        action: 'PAYMENT_VERIFIED',
        entityType: 'Payment',
        entityId: 'payment-1',
      },
    });

    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', customer.authorization)
      .expect(403);

    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', admin.authorization)
      .expect(200);

    expect(response.body.data.data[0]).toMatchObject({
      action: 'PAYMENT_VERIFIED',
      entityType: 'Payment',
    });
  });
});
