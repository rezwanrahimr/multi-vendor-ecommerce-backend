import {
  DeliveryAreaStatus,
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
      { name: 'Feni Sadar', slug: 'feni-sadar', fee: 60 },
      { name: 'Chhagalnaiya', slug: 'chhagalnaiya', fee: 90 },
      { name: 'Daganbhuiyan', slug: 'daganbhuiyan', fee: 90 },
      { name: 'Parshuram', slug: 'parshuram', fee: 100 },
      { name: 'Fulgazi', slug: 'fulgazi', fee: 100 },
      { name: 'Sonagazi', slug: 'sonagazi', fee: 110 },
    ].map((area) =>
      prisma.deliveryArea.upsert({
        where: { slug: area.slug },
        update: {
          fee: area.fee,
          status: DeliveryAreaStatus.ACTIVE,
        },
        create: {
          ...area,
          estimatedDeliveryTime: '1-2 days',
        },
      }),
    ),
  );

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
