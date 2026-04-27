import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { buildPaginationMeta, getPagination } from '../../utils/pagination.util';
import { createSlug } from '../../utils/slug.util';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(vendorId: string, dto: CreateProductDto) {
    const slug = dto.slug ?? createSlug(dto.name);

    return this.prisma.product.create({
      data: {
        vendorId,
        categoryId: dto.categoryId,
        name: dto.name,
        slug,
        description: dto.description,
        price: dto.price,
        discountPrice: dto.discountPrice,
        stock: dto.stock ?? 0,
        sku: dto.sku,
        images: dto.images ?? [],
        status: dto.status,
      },
      include: this.defaultInclude(),
    });
  }

  async findAll(query: ProductQueryDto) {
    const pagination = getPagination({ page: query.page, limit: query.limit });
    const where: Prisma.ProductWhereInput = {
      status: query.status,
      categoryId: query.categoryId,
      vendorId: query.vendorId,
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: this.defaultInclude(),
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  findOne(id: string) {
    return this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: this.defaultInclude(),
    });
  }

  findBySlug(slug: string) {
    return this.prisma.product.findUniqueOrThrow({
      where: { slug },
      include: this.defaultInclude(),
    });
  }

  update(id: string, dto: UpdateProductDto) {
    return this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        slug: dto.slug ?? (dto.name ? createSlug(dto.name) : undefined),
      },
      include: this.defaultInclude(),
    });
  }

  remove(id: string) {
    return this.prisma.product.delete({
      where: { id },
      include: this.defaultInclude(),
    });
  }

  private defaultInclude() {
    return {
      vendor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      category: true,
    } as const;
  }
}
