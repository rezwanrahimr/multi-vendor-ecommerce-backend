import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import {
  buildPaginationMeta,
  getPagination,
} from '../../utils/pagination.util';
import { createSlug } from '../../utils/slug.util';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateMeDto } from './dto/update-me.dto';
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

  findMe(id: string) {
    return this.findOne(id);
  }

  updateMe(id: string, dto: UpdateMeDto) {
    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
      },
      select: this.defaultSelect(),
    });
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('New password and confirm password do not match');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!user.passwordHash) {
      throw new BadRequestException('Password change is unavailable for this account');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    return this.prisma.user.update({
      where: { id },
      data: { passwordHash },
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
