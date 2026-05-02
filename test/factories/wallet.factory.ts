import { PrismaClient } from '@prisma/client';
import { createVendor } from './users.factory';

type WalletFactoryOverrides = {
  vendorId?: string;
  balance?: number;
  pendingBalance?: number;
  totalEarned?: number;
  totalWithdrawn?: number;
};

export async function createWallet(
  prisma: PrismaClient,
  overrides: WalletFactoryOverrides = {},
) {
  const vendorId = overrides.vendorId ?? (await createVendor(prisma)).id;

  return prisma.wallet.upsert({
    where: { vendorId },
    update: {
      balance: overrides.balance,
      pendingBalance: overrides.pendingBalance,
      totalEarned: overrides.totalEarned,
      totalWithdrawn: overrides.totalWithdrawn,
    },
    create: {
      vendorId,
      balance: 0,
      pendingBalance: 0,
      totalEarned: 0,
      totalWithdrawn: 0,
      ...overrides,
    },
  });
}
