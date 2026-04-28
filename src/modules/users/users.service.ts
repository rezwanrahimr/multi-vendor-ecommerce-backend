import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import {
  buildPaginationMeta,
  getPagination,
} from '../../utils/pagination.util';
import { createSlug } from '../../utils/slug.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 12)
      : undefined;

    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role: dto.role,
        status: dto.status,
        wallet: dto.role === UserRole.VENDOR ? { create: {} } : undefined,
        store:
          dto.role === UserRole.VENDOR
            ? {
                create: {
                  name: dto.storeName ?? `${dto.name}'s Store`,
                  slug: createSlug(`${dto.storeName ?? dto.name}-${dto.email}`),
                },
              }
            : undefined,
      },
      select: this.defaultSelect(),
    });
  }

  async findAll(query: UserQueryDto) {
    const pagination = getPagination({ page: query.page, limit: query.limit });
    const where: Prisma.UserWhereInput = {
      role: query.role,
      status: query.status,
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
            {
              store: {
                name: { contains: query.search, mode: 'insensitive' },
              },
            },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        select: this.defaultSelect(),
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  findOne(id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: this.defaultSelect(),
    });
  }

  update(id: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: this.defaultSelect(),
    });
  }

  remove(id: string) {
    return this.prisma.user.delete({
      where: { id },
      select: this.defaultSelect(),
    });
  }

  private defaultSelect() {
    return {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatarUrl: true,
      role: true,
      status: true,
      store: {
        include: {
          _count: {
            select: { products: true },
          },
        },
      },
      createdAt: true,
      updatedAt: true,
    } as const;
  }
}
