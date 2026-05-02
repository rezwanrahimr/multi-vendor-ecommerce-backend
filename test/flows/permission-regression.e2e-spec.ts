import { INestApplication } from '@nestjs/common';
import { DeliveryStatus, PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { createOrder, createProduct, createStore } from '../factories';
import {
  createAdminAuth,
  createCustomerAuth,
  createDeliveryManAuth,
  createVendorAuth,
} from '../helpers/auth.helper';
import { createE2eApp } from '../helpers/e2e-app';
import { resetDatabase } from '../helpers/reset-db';

describe('Permission and ownership regression tests (e2e)', () => {
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

  it('blocks customer and vendor access to admin-only routes', async () => {
    const customer = await createCustomerAuth(app, prisma);
    const vendor = await createVendorAuth(app, prisma);
    const admin = await createAdminAuth(app, prisma);

    await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', customer.authorization)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', vendor.authorization)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', admin.authorization)
      .expect(200);
  });

  it('prevents customers from reading another customer order', async () => {
    const owner = await createCustomerAuth(app, prisma);
    const stranger = await createCustomerAuth(app, prisma);
    const order = await createOrder(prisma, { customerId: owner.user.id });

    await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', stranger.authorization)
      .expect(404);
  });

  it('prevents vendors from updating another vendor product and settling wallets', async () => {
    const vendorOne = await createVendorAuth(app, prisma);
    const vendorTwo = await createVendorAuth(app, prisma);
    const storeOne = await createStore(prisma, { vendorId: vendorOne.user.id });
    const product = await createProduct(prisma, {
      vendorId: vendorOne.user.id,
      storeId: storeOne.id,
    });
    const order = await createOrder(prisma);

    await request(app.getHttpServer())
      .patch(`/api/v1/vendor/products/${product.id}`)
      .set('Authorization', vendorTwo.authorization)
      .send({ name: 'Illegal Update' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${order.id}/settle-wallet`)
      .set('Authorization', vendorTwo.authorization)
      .expect(403);
  });

  it('prevents delivery men from updating unassigned orders', async () => {
    const deliveryMan = await createDeliveryManAuth(app, prisma);
    const order = await createOrder(prisma);

    await request(app.getHttpServer())
      .patch(`/api/v1/delivery/orders/${order.id}/status`)
      .set('Authorization', deliveryMan.authorization)
      .send({ deliveryStatus: DeliveryStatus.ACCEPTED })
      .expect(404);
  });

  it('keeps protected routes unavailable without a token', async () => {
    await request(app.getHttpServer()).get('/api/v1/orders').expect(401);
  });
});
