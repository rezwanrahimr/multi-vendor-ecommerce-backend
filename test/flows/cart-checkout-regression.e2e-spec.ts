import { INestApplication } from '@nestjs/common';
import {
  CategoryStatus,
  CommissionType,
  PrismaClient,
  ProductStatus,
  StoreVerificationStatus,
} from '@prisma/client';
import * as request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import {
  createCategory,
  createCommissionRule,
  createDeliveryZone,
  createProduct,
  createStore,
} from '../factories';
import { createCustomerAuth } from '../helpers/auth.helper';
import { createE2eApp } from '../helpers/e2e-app';
import { resetDatabase } from '../helpers/reset-db';

describe('Cart and checkout regression tests (e2e)', () => {
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

  it('rejects non-cartable products and quantities above stock', async () => {
    const customer = await createCustomerAuth(app, prisma);
    const pendingProduct = await createProduct(prisma, {
      status: ProductStatus.PENDING_REVIEW,
    });
    const inactiveProduct = await createProduct(prisma, {
      status: ProductStatus.INACTIVE,
    });
    const inactiveCategory = await createCategory(prisma, {
      status: CategoryStatus.INACTIVE,
    });
    const productInInactiveCategory = await createProduct(prisma, {
      categoryId: inactiveCategory.id,
    });
    const unapprovedStore = await createStore(prisma, {
      verificationStatus: StoreVerificationStatus.PENDING,
    });
    const productFromUnapprovedVendor = await createProduct(prisma, {
      vendorId: unapprovedStore.vendorId,
      storeId: unapprovedStore.id,
    });
    const lowStockProduct = await createProduct(prisma, {
      stock: 1,
    });

    for (const productId of [
      pendingProduct.id,
      inactiveProduct.id,
      productInInactiveCategory.id,
      productFromUnapprovedVendor.id,
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', customer.authorization)
        .send({ productId, quantity: 1 })
        .expect(400);
    }

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', customer.authorization)
      .send({ productId: lowStockProduct.id, quantity: 2 })
      .expect(400);
  });

  it('calculates checkout from backend price, delivery zone, and commission rule', async () => {
    const customer = await createCustomerAuth(app, prisma);
    const product = await createProduct(prisma, {
      price: 200,
      stock: 5,
    });
    const deliveryZone = await createDeliveryZone(prisma, {
      baseCharge: 50,
      sameDayCharge: 80,
    });

    await createCommissionRule(prisma, {
      commissionType: CommissionType.PERCENTAGE,
      commissionValue: 10,
      priority: 5,
    });

    await request(app.getHttpServer())
      .post('/api/v1/checkout/calculate')
      .set('Authorization', customer.authorization)
      .send({
        deliveryZoneId: deliveryZone.id,
        items: [{ productId: product.id, quantity: 2, price: 1 }],
      })
      .expect(400);

    const response = await request(app.getHttpServer())
      .post('/api/v1/checkout/calculate')
      .set('Authorization', customer.authorization)
      .send({
        deliveryZoneId: deliveryZone.id,
        items: [{ productId: product.id, quantity: 2 }],
      })
      .expect(201);

    expect(response.body.data.items[0]).toMatchObject({
      productId: product.id,
      quantity: 2,
      unitPrice: 200,
      subtotal: 400,
      commissionType: CommissionType.PERCENTAGE,
      commissionValue: 10,
      commissionAmount: 40,
      vendorEarning: 360,
    });
    expect(response.body.data.summary).toMatchObject({
      subtotal: 400,
      deliveryCharge: 50,
      grandTotal: 450,
    });
  });
});
