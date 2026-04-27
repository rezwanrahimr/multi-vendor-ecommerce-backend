import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { createSlug } from '../../utils/slug.util';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug ?? createSlug(dto.name),
        description: dto.description,
        parentId: dto.parentId,
      },
    });
  }

  findAll() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        children: true,
        _count: {
          select: { products: true },
        },
      },
    });
  }

  findOne(id: string) {
    return this.prisma.category.findUniqueOrThrow({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });
  }

  update(id: string, dto: UpdateCategoryDto) {
    return this.prisma.category.update({
      where: { id },
      data: {
        ...dto,
        slug: dto.slug ?? (dto.name ? createSlug(dto.name) : undefined),
      },
    });
  }

  remove(id: string) {
    return this.prisma.category.delete({
      where: { id },
    });
  }
}
