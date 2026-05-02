import { PrismaClient } from '@prisma/client';
import { createCustomer } from './users.factory';
import { createProduct } from './product.factory';

type CartItemFactoryOverrides = {
  cartId?: string;
  productId?: string;
  quantity?: number;
};

export async function createCart(
  prisma: PrismaClient,
  customerId?: string,
) {
  return prisma.cart.create({
    data: {
      customerId: customerId ?? (await createCustomer(prisma)).id,
    },
  });
}

export async function createCartItem(
  prisma: PrismaClient,
  overrides: CartItemFactoryOverrides = {},
) {
  const cartId = overrides.cartId ?? (await createCart(prisma)).id;
  const productId = overrides.productId ?? (await createProduct(prisma)).id;

  return prisma.cartItem.create({
    data: {
      cartId,
      productId,
      quantity: 1,
      ...overrides,
    },
  });
}
