import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  CategoryStatus,
  Prisma,
  ProductStatus,
  StoreStatus,
  StoreVerificationStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Injectable()
export class CartsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMyCart(customerId: string) {
    const cart = await this.findOrCreateCart(customerId);

    return this.buildCartResponse(cart.id);
  }

  async addItem(customerId: string, dto: AddCartItemDto) {
    const product = await this.findCartableProduct(dto.productId);

    this.assertQuantityAvailable(product.stock, dto.quantity);

    const cart = await this.findOrCreateCart(customerId);
    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: dto.productId,
        },
      },
      select: {
        id: true,
        quantity: true,
      },
    });

    if (existingItem) {
      const nextQuantity = existingItem.quantity + dto.quantity;
      this.assertQuantityAvailable(product.stock, nextQuantity);

      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: nextQuantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          quantity: dto.quantity,
        },
      });
    }

    return this.buildCartResponse(cart.id);
  }

  async updateItem(customerId: string, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.findOwnedCartItem(customerId, itemId);
    const product = await this.findCartableProduct(item.productId);

    this.assertQuantityAvailable(product.stock, dto.quantity);

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity },
    });

    return this.buildCartResponse(item.cartId);
  }

  async removeItem(customerId: string, itemId: string) {
    const item = await this.findOwnedCartItem(customerId, itemId);

    await this.prisma.cartItem.delete({
      where: { id: itemId },
    });

    return this.buildCartResponse(item.cartId);
  }

  async clear(customerId: string) {
    const cart = await this.findOrCreateCart(customerId);

    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return this.buildCartResponse(cart.id);
  }

  private findOrCreateCart(customerId: string) {
    return this.prisma.cart.upsert({
      where: { customerId },
      update: {},
      create: { customerId },
      select: { id: true },
    });
  }

  private async buildCartResponse(cartId: string) {
    const cart = await this.prisma.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            product: {
              include: {
                store: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    status: true,
                    verificationStatus: true,
                  },
                },
                vendor: {
                  select: {
                    id: true,
                    name: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const items = cart.items.map((item) => {
      const unitPrice = this.getProductUnitPrice(item.product).toDecimalPlaces(2);
      const lineSubtotal = unitPrice.mul(item.quantity).toDecimalPlaces(2);

      return {
        cartItemId: item.id,
        productId: item.productId,
        productName: item.product.name,
        productSlug: item.product.slug,
        productImage: item.product.images[0] ?? null,
        vendor: {
          id: item.product.vendorId,
          name: item.product.vendor.name,
        },
        store: {
          id: item.product.storeId,
          name: item.product.store.name,
          slug: item.product.store.slug,
        },
        quantity: item.quantity,
        unitPrice: unitPrice.toNumber(),
        lineSubtotal: lineSubtotal.toNumber(),
        availableStock: item.product.stock,
        productStatus: item.product.status,
      };
    });
    const subtotal = items.reduce(
      (sum, item) => sum.add(item.lineSubtotal),
      new Prisma.Decimal(0),
    );
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

    return {
      id: cart.id,
      items,
      summary: {
        subtotal: subtotal.toDecimalPlaces(2).toNumber(),
        itemCount: items.length,
        totalQuantity,
      },
    };
  }

  private async findOwnedCartItem(customerId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        cartId: true,
        productId: true,
        cart: {
          select: {
            customerId: true,
          },
        },
      },
    });

    if (!item || item.cart.customerId !== customerId) {
      throw new ForbiddenException('You can only manage your own cart');
    }

    return item;
  }

  private async findCartableProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: {
          select: {
            id: true,
            status: true,
          },
        },
        store: {
          select: {
            status: true,
            verificationStatus: true,
            vendor: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new BadRequestException('Selected product does not exist');
    }

    if (product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException('Selected product is not available');
    }

    if (product.stock < 1) {
      throw new BadRequestException('Selected product is out of stock');
    }

    if (!product.category || product.category.status !== CategoryStatus.ACTIVE) {
      throw new BadRequestException('Selected product category is unavailable');
    }

    if (
      product.store.status !== StoreStatus.ACTIVE ||
      product.store.verificationStatus !== StoreVerificationStatus.VERIFIED ||
      product.store.vendor.status !== UserStatus.ACTIVE
    ) {
      throw new BadRequestException('Selected product vendor is unavailable');
    }

    return product;
  }

  private assertQuantityAvailable(stock: number, quantity: number) {
    if (quantity > stock) {
      throw new BadRequestException('Requested quantity exceeds available stock');
    }
  }

  private getProductUnitPrice(product: {
    price: Prisma.Decimal;
    discountPrice: Prisma.Decimal | null;
  }) {
    return new Prisma.Decimal(product.discountPrice ?? product.price);
  }
}
