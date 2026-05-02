import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, User, UserRole } from '@prisma/client';
import * as request from 'supertest';
import {
  createAdmin,
  createCustomer,
  createDeliveryMan,
  createVendor,
  TEST_PASSWORD,
} from '../factories/users.factory';

export type TestAuth = {
  user: User;
  token: string;
  authorization: string;
};

function signTestToken(app: INestApplication, user: User) {
  const jwtService = app.get(JwtService);
  const token = jwtService.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    {
      secret: process.env.JWT_SECRET ?? 'test-secret',
      expiresIn: '1h',
    },
  );

  return {
    token,
    authorization: `Bearer ${token}`,
  };
}

export async function createAuthForUser(
  app: INestApplication,
  prisma: PrismaClient,
  role: UserRole,
): Promise<TestAuth> {
  const user =
    role === UserRole.ADMIN
      ? await createAdmin(prisma)
      : role === UserRole.VENDOR
        ? await createVendor(prisma)
        : role === UserRole.DELIVERY_MAN
          ? await createDeliveryMan(prisma)
          : await createCustomer(prisma);
  const auth = signTestToken(app, user);

  return {
    user,
    ...auth,
  };
}

export function createAdminAuth(app: INestApplication, prisma: PrismaClient) {
  return createAuthForUser(app, prisma, UserRole.ADMIN);
}

export function createCustomerAuth(app: INestApplication, prisma: PrismaClient) {
  return createAuthForUser(app, prisma, UserRole.CUSTOMER);
}

export function createVendorAuth(app: INestApplication, prisma: PrismaClient) {
  return createAuthForUser(app, prisma, UserRole.VENDOR);
}

export function createDeliveryManAuth(app: INestApplication, prisma: PrismaClient) {
  return createAuthForUser(app, prisma, UserRole.DELIVERY_MAN);
}

export async function registerCustomer(app: INestApplication) {
  const email = `customer.${Date.now()}@example.com`;
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      name: 'Registered Customer',
      email,
      password: TEST_PASSWORD,
      role: UserRole.CUSTOMER,
    })
    .expect(201);

  return response.body.data;
}
