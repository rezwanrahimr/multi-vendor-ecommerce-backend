import { PrismaClient, ProductStatus, UserRole } from '@prisma/client';
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

  await prisma.product.upsert({
    where: { slug: 'premium-rice-5kg' },
    update: {},
    create: {
      name: 'Premium Rice 5kg',
      slug: 'premium-rice-5kg',
      description: 'Quality rice from a verified HelloFeni vendor.',
      price: 620,
      stock: 50,
      status: ProductStatus.ACTIVE,
      vendorId: vendor.id,
      categoryId: category.id,
      images: [],
    },
  });

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
