import { PrismaClient, WithdrawalStatus } from '@prisma/client';
import { createWallet } from './wallet.factory';

type PayoutFactoryOverrides = {
  walletId?: string;
  amount?: number;
  status?: WithdrawalStatus;
  paymentMethod?: string;
  accountNumber?: string;
  accountName?: string;
  note?: string;
};

export async function createPayout(
  prisma: PrismaClient,
  overrides: PayoutFactoryOverrides = {},
) {
  const walletId = overrides.walletId ?? (await createWallet(prisma)).id;

  return prisma.withdrawalRequest.create({
    data: {
      walletId,
      amount: 100,
      status: WithdrawalStatus.PENDING,
      paymentMethod: 'BKASH',
      accountNumber: '01700000000',
      accountName: 'Test Vendor',
      ...overrides,
    },
  });
}
