import {
  CommissionType,
  PrismaClient,
  ProductStatus,
  StoreVerificationStatus,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  const seededAccounts: string[] = [];
  const adminEmail =
    process.env.SEED_ADMIN_EMAIL ?? (isProduction ? undefined : 'admin@hellofeni.com');
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ?? (isProduction ? undefined : 'Password123!');

  if (adminEmail && adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        name: process.env.SEED_ADMIN_NAME ?? 'HelloFeni Admin',
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
      },
    });

    seededAccounts.push(admin.email);
  } else {
    console.log('Skipped admin seed because SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD are not set.');
  }

  const category = await prisma.category.upsert({
    where: { slug: 'groceries' },
    update: {},
    create: {
      name: 'Groceries',
      slug: 'groceries',
      description: 'Daily essentials and household products.',
    },
  });

  if (!isProduction) {
    const demoPasswordHash = await bcrypt.hash(
      process.env.SEED_DEMO_PASSWORD ?? 'Password123!',
      12,
    );
    const vendor = await prisma.user.upsert({
      where: { email: 'vendor@hellofeni.com' },
      update: {},
      create: {
        name: 'Demo Vendor',
        email: 'vendor@hellofeni.com',
        passwordHash: demoPasswordHash,
        role: UserRole.VENDOR,
        wallet: {
          create: {},
        },
      },
    });

    const store = await prisma.store.upsert({
      where: { vendorId: vendor.id },
      update: {},
      create: {
        vendorId: vendor.id,
        name: 'Demo Vendor Store',
        slug: 'demo-vendor-store',
        verificationStatus: StoreVerificationStatus.VERIFIED,
        commissionRate: 10,
      },
    });

    await prisma.product.upsert({
      where: { slug: 'premium-rice-5kg' },
      update: {
        vendorId: vendor.id,
        storeId: store.id,
      },
      create: {
        name: 'Premium Rice 5kg',
        slug: 'premium-rice-5kg',
        description: 'Quality rice from a verified HelloFeni vendor.',
        price: 620,
        stock: 50,
        status: ProductStatus.ACTIVE,
        vendorId: vendor.id,
        storeId: store.id,
        categoryId: category.id,
        images: [],
      },
    });

    seededAccounts.push(vendor.email);
  }

  await Promise.all(
    [
      { name: 'Feni Sadar', slug: 'feni-sadar', baseCharge: 50, sameDayCharge: 80 },
      { name: 'Daganbhuiyan', slug: 'daganbhuiyan', baseCharge: 80, sameDayCharge: 120 },
      { name: 'Sonagazi', slug: 'sonagazi', baseCharge: 100, sameDayCharge: 150 },
      { name: 'Chhagalnaiya', slug: 'chhagalnaiya', baseCharge: 90, sameDayCharge: 130 },
      { name: 'Parshuram', slug: 'parshuram', baseCharge: 110, sameDayCharge: 160 },
      { name: 'Fulgazi', slug: 'fulgazi', baseCharge: 100, sameDayCharge: 150 },
    ].map((zone) =>
      prisma.deliveryZone.upsert({
        where: { slug: zone.slug },
        update: {
          baseCharge: zone.baseCharge,
          sameDayCharge: zone.sameDayCharge,
          isActive: true,
        },
        create: {
          ...zone,
          district: 'Feni',
          area: zone.name,
          estimatedDeliveryTime: '1-2 days',
        },
      }),
    ),
  );

  await prisma.setting.upsert({
    where: { key: 'GLOBAL_COMMISSION_RATE' },
    update: {
      value: '10',
      type: 'number',
      description: 'Default platform commission percentage.',
    },
    create: {
      key: 'GLOBAL_COMMISSION_RATE',
      value: '10',
      type: 'number',
      description: 'Default platform commission percentage.',
    },
  });

  const activeGlobalCommissionRule = await prisma.commissionRule.findFirst({
    where: {
      vendorId: null,
      categoryId: null,
      productId: null,
      isActive: true,
    },
  });

  if (!activeGlobalCommissionRule) {
    await prisma.commissionRule.upsert({
      where: { id: 'global-default-commission' },
      update: {
        commissionType: CommissionType.PERCENTAGE,
        commissionValue: 10,
        priority: 5,
        isActive: true,
      },
      create: {
        id: 'global-default-commission',
        commissionType: CommissionType.PERCENTAGE,
        commissionValue: 10,
        priority: 5,
        isActive: true,
      },
    });
  }

  console.log(
    `Seeded HelloFeni baseline data${
      seededAccounts.length ? ` and accounts: ${seededAccounts.join(', ')}` : ''
    }`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
