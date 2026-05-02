import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  buildPaginationMeta,
  getPagination,
} from '../../utils/pagination.util';
import { createSlug } from '../../utils/slug.util';
import {
  CalculateDeliveryChargeDto,
  DeliveryType,
} from './dto/calculate-delivery-charge.dto';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { DeliveryZoneQueryDto } from './dto/delivery-zone-query.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';

@Injectable()
export class DeliveryZonesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateDeliveryZoneDto) {
    return this.prisma.deliveryZone.create({
      data: {
        name: dto.name,
        slug: this.createZoneSlug(dto),
        district: dto.district,
        area: dto.area,
        baseCharge: dto.baseCharge,
        sameDayCharge: dto.sameDayCharge,
        freeDeliveryMinAmount: dto.freeDeliveryMinAmount,
        estimatedDeliveryTime: dto.estimatedDeliveryTime,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAll(query: DeliveryZoneQueryDto) {
    const pagination = getPagination({ page: query.page, limit: query.limit });
    const where: Prisma.DeliveryZoneWhereInput = {
      isActive: query.isActive,
      district: query.district
        ? { contains: query.district, mode: 'insensitive' }
        : undefined,
      area: query.area ? { contains: query.area, mode: 'insensitive' } : undefined,
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { district: { contains: query.search, mode: 'insensitive' } },
            { area: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.deliveryZone.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ district: 'asc' }, { area: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.deliveryZone.count({ where }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  findOne(id: string) {
    return this.prisma.deliveryZone.findUniqueOrThrow({
      where: { id },
    });
  }

  findPublicAll() {
    return this.prisma.deliveryZone.findMany({
      where: { isActive: true },
      orderBy: [{ district: 'asc' }, { area: 'asc' }, { name: 'asc' }],
      select: this.publicSelect(),
    });
  }

  findPublicOne(id: string) {
    return this.prisma.deliveryZone.findFirstOrThrow({
      where: { id, isActive: true },
      select: this.publicSelect(),
    });
  }

  async update(id: string, dto: UpdateDeliveryZoneDto) {
    const shouldRefreshSlug = dto.name || dto.district || dto.area;
    const current = shouldRefreshSlug
      ? await this.prisma.deliveryZone.findUniqueOrThrow({
          where: { id },
          select: { name: true, district: true, area: true },
        })
      : null;

    return this.prisma.deliveryZone.update({
      where: { id },
      data: {
        name: dto.name,
        slug: current
          ? this.createZoneSlug({
              name: dto.name ?? current.name,
              district: dto.district ?? current.district,
              area: dto.area ?? current.area,
            })
          : undefined,
        district: dto.district,
        area: dto.area,
        baseCharge: dto.baseCharge,
        sameDayCharge: dto.sameDayCharge,
        freeDeliveryMinAmount: dto.freeDeliveryMinAmount,
        estimatedDeliveryTime: dto.estimatedDeliveryTime,
        isActive: dto.isActive,
      },
    });
  }

  activate(id: string) {
    return this.prisma.deliveryZone.update({
      where: { id },
      data: { isActive: true },
    });
  }

  deactivate(id: string) {
    return this.prisma.deliveryZone.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async remove(id: string) {
    const zone = await this.prisma.deliveryZone.findUniqueOrThrow({
      where: { id },
      include: {
        _count: {
          select: { orders: true },
        },
      },
    });

    if (zone._count.orders > 0) {
      return this.deactivate(id);
    }

    return this.prisma.deliveryZone.delete({
      where: { id },
    });
  }

  calculateChargeFromDto(dto: CalculateDeliveryChargeDto) {
    return this.calculateCharge(
      dto.deliveryZoneId,
      dto.subtotal,
      dto.deliveryType,
    );
  }

  async calculateCharge(
    deliveryZoneId: string,
    subtotal: number | Prisma.Decimal,
    deliveryType: DeliveryType = DeliveryType.NORMAL,
  ) {
    const subtotalDecimal = new Prisma.Decimal(subtotal);

    if (subtotalDecimal.lte(0)) {
      throw new BadRequestException('subtotal must be greater than 0');
    }

    const deliveryZone = await this.prisma.deliveryZone.findUnique({
      where: { id: deliveryZoneId },
    });

    if (!deliveryZone || !deliveryZone.isActive) {
      throw new BadRequestException('Selected delivery zone is unavailable');
    }

    const isFreeDelivery = Boolean(
      deliveryZone.freeDeliveryMinAmount &&
        subtotalDecimal.gte(deliveryZone.freeDeliveryMinAmount),
    );
    const selectedCharge =
      deliveryType === DeliveryType.SAME_DAY && deliveryZone.sameDayCharge
        ? deliveryZone.sameDayCharge
        : deliveryZone.baseCharge;
    const deliveryCharge = isFreeDelivery
      ? new Prisma.Decimal(0)
      : new Prisma.Decimal(selectedCharge);

    return {
      deliveryZoneId: deliveryZone.id,
      deliveryType,
      subtotal: subtotalDecimal.toNumber(),
      baseCharge: new Prisma.Decimal(deliveryZone.baseCharge).toNumber(),
      sameDayCharge: deliveryZone.sameDayCharge
        ? new Prisma.Decimal(deliveryZone.sameDayCharge).toNumber()
        : null,
      freeDeliveryMinAmount: deliveryZone.freeDeliveryMinAmount
        ? new Prisma.Decimal(deliveryZone.freeDeliveryMinAmount).toNumber()
        : null,
      deliveryCharge: deliveryCharge.toNumber(),
      isFreeDelivery,
      estimatedDeliveryTime: deliveryZone.estimatedDeliveryTime,
    };
  }

  private createZoneSlug(input: {
    name?: string;
    district?: string;
    area?: string;
  }) {
    return createSlug(
      [input.district, input.area, input.name].filter(Boolean).join(' '),
    );
  }

  private publicSelect() {
    return {
      id: true,
      name: true,
      district: true,
      area: true,
      baseCharge: true,
      sameDayCharge: true,
      freeDeliveryMinAmount: true,
      estimatedDeliveryTime: true,
    } as const;
  }
}
