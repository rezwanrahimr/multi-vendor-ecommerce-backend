import { CategoryStatus, PrismaClient } from '@prisma/client';

let sequence = 0;

type CategoryFactoryOverrides = {
  id?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  parentId?: string | null;
  status?: CategoryStatus;
  imageUrl?: string | null;
  imagePublicId?: string | null;
};

export function createCategory(
  prisma: PrismaClient,
  overrides: CategoryFactoryOverrides = {},
) {
  sequence += 1;

  return prisma.category.create({
    data: {
      name: `Test Category ${sequence}`,
      slug: `test-category-${Date.now()}-${sequence}`,
      status: CategoryStatus.ACTIVE,
      ...overrides,
    },
  });
}
