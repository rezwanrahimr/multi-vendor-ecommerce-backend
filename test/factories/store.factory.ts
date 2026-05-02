import {
  PrismaClient,
  StoreStatus,
  StoreVerificationStatus,
} from '@prisma/client';
import { createVendor } from './users.factory';

let sequence = 0;

type StoreFactoryOverrides = {
  vendorId?: string;
  name?: string;
  slug?: string;
  status?: StoreStatus;
  verificationStatus?: StoreVerificationStatus;
  commissionRate?: number;
};

export async function createStore(
  prisma: PrismaClient,
  overrides: StoreFactoryOverrides = {},
) {
  sequence += 1;
  const vendorId = overrides.vendorId ?? (await createVendor(prisma)).id;

  return prisma.store.create({
    data: {
      vendorId,
      name: `Test Store ${sequence}`,
      slug: `test-store-${Date.now()}-${sequence}`,
      status: StoreStatus.ACTIVE,
      verificationStatus: StoreVerificationStatus.VERIFIED,
      commissionRate: 10,
      ...overrides,
    },
  });
}
