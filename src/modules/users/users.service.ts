import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import {
  buildPaginationMeta,
  getPagination,
} from '../../utils/pagination.util';
import { createSlug } from '../../utils/slug.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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

  async findAll(page?: number, limit?: number) {
    const pagination = getPagination({ page, limit });
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        select: this.defaultSelect(),
      }),
      this.prisma.user.count(),
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
      store: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }
}
