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
  const passwordHash = await bcrypt.hash('Password123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@hellofeni.com' },
    update: {},
    create: {
      name: 'HelloFeni Admin',
      email: 'admin@hellofeni.com',
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  const vendor = await prisma.user.upsert({
    where: { email: 'vendor@hellofeni.com' },
    update: {},
    create: {
      name: 'Demo Vendor',
      email: 'vendor@hellofeni.com',
      passwordHash,
      role: UserRole.VENDOR,
      wallet: {
        create: {},
      },
    },
  });

  const category = await prisma.category.upsert({
    where: { slug: 'groceries' },
    update: {},
    create: {
      name: 'Groceries',
      slug: 'groceries',
      description: 'Daily essentials and household products.',
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

  console.log(`Seeded admin ${admin.email} and vendor ${vendor.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
