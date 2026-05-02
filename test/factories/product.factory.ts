import { PrismaClient, ProductStatus } from '@prisma/client';
import { createCategory } from './category.factory';
import { createStore } from './store.factory';

let sequence = 0;

type ProductFactoryOverrides = {
  vendorId?: string;
  storeId?: string;
  categoryId?: string | null;
  name?: string;
  slug?: string;
  description?: string;
  price?: number;
  discountPrice?: number | null;
  stock?: number;
  sku?: string;
  images?: string[];
  imagePublicIds?: string[];
  status?: ProductStatus;
};

export async function createProduct(
  prisma: PrismaClient,
  overrides: ProductFactoryOverrides = {},
) {
  sequence += 1;
  const store = overrides.storeId
    ? null
    : await createStore(prisma);
  const categoryId = overrides.categoryId ?? (await createCategory(prisma)).id;

  return prisma.product.create({
    data: {
      name: `Test Product ${sequence}`,
      slug: `test-product-${Date.now()}-${sequence}`,
      description: 'Factory product',
      price: 200,
      stock: 20,
      status: ProductStatus.ACTIVE,
      images: ['https://example.com/product.jpg'],
      vendorId: overrides.vendorId ?? store!.vendorId,
      storeId: overrides.storeId ?? store!.id,
      categoryId,
      ...overrides,
    },
  });
}
