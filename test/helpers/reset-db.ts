import { PrismaClient } from '@prisma/client';

const TABLES = [
  'WalletTransaction',
  'WithdrawalRequest',
  'CouponUsage',
  'Payment',
  'StockLog',
  'OrderItem',
  'Order',
  'Notification',
  'AuditLog',
  'CartItem',
  'Cart',
  'Review',
  'Coupon',
  'CommissionRule',
  'Product',
  'Store',
  'Category',
  'DeliveryZone',
  'HomeBanner',
  'Setting',
  'Wallet',
  'User',
];

export function assertSafeTestDatabase() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  const databaseUrl = process.env.DATABASE_URL;

  if (!testDatabaseUrl || !databaseUrl) {
    throw new Error('TEST_DATABASE_URL and DATABASE_URL are required for e2e tests.');
  }

  if (process.env.ORIGINAL_DATABASE_URL && testDatabaseUrl === process.env.ORIGINAL_DATABASE_URL) {
    throw new Error('Refusing to reset database because TEST_DATABASE_URL matches DATABASE_URL.');
  }

  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Refusing to reset database outside NODE_ENV=test.');
  }
}

export async function resetDatabase(prisma: PrismaClient) {
  assertSafeTestDatabase();

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
}
