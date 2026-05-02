import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

let sequence = 0;
export const TEST_PASSWORD = 'Password123!';

type UserFactoryOverrides = {
  id?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  passwordHash?: string | null;
  role?: UserRole;
  status?: UserStatus;
};

function nextEmail(role: string) {
  sequence += 1;
  return `${role}.${Date.now()}.${sequence}@example.com`;
}

export async function createUser(
  prisma: PrismaClient,
  overrides: UserFactoryOverrides = {},
) {
  const role = (overrides.role as UserRole | undefined) ?? UserRole.CUSTOMER;
  const email = (overrides.email as string | undefined) ?? nextEmail(role.toLowerCase());
  const passwordHash =
    (overrides.passwordHash as string | undefined) ??
    (await bcrypt.hash(TEST_PASSWORD, 8));

  return prisma.user.create({
    data: {
      name: `${role} Test User`,
      email,
      passwordHash,
      role,
      status: UserStatus.ACTIVE,
      ...overrides,
    },
  });
}

export function createAdmin(prisma: PrismaClient, overrides = {}) {
  return createUser(prisma, { role: UserRole.ADMIN, ...overrides });
}

export function createCustomer(prisma: PrismaClient, overrides = {}) {
  return createUser(prisma, { role: UserRole.CUSTOMER, ...overrides });
}

export function createDeliveryMan(prisma: PrismaClient, overrides = {}) {
  return createUser(prisma, { role: UserRole.DELIVERY_MAN, ...overrides });
}

export async function createVendor(prisma: PrismaClient, overrides = {}) {
  const vendor = await createUser(prisma, { role: UserRole.VENDOR, ...overrides });

  await prisma.wallet.upsert({
    where: { vendorId: vendor.id },
    update: {},
    create: { vendorId: vendor.id },
  });

  return vendor;
}
