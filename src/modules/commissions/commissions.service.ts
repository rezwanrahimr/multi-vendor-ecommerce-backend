import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { CommissionRule, CommissionType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  buildPaginationMeta,
  getPagination,
} from '../../utils/pagination.util';
import { CommissionPreviewDto } from './dto/commission-preview.dto';
import { CommissionRuleQueryDto } from './dto/commission-rule-query.dto';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto';
import { UpdateCommissionRuleDto } from './dto/update-commission-rule.dto';

type CommissionSource =
  | 'PRODUCT'
  | 'VENDOR_CATEGORY'
  | 'VENDOR'
  | 'CATEGORY'
  | 'GLOBAL';

type RuleScope = {
  source: CommissionSource;
  vendorId: string | null;
  categoryId: string | null;
  productId: string | null;
  priority: number;
};

type CommissionParams = {
  vendorId: string;
  categoryId: string;
  productId?: string | null;
  price: number | Prisma.Decimal;
  quantity?: number;
  date?: Date;
};

type ResolveParams = {
  vendorId: string;
  categoryId: string;
  productId?: string | null;
  date?: Date;
};

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCommissionRuleDto) {
    const scope = await this.resolveScope(dto);
    this.validateCommissionValue(dto.commissionType, dto.commissionValue);
    this.validateDateRange(dto.startsAt, dto.endsAt);

    if (dto.isActive ?? true) {
      await this.assertNoActiveConflict(scope);
    }

    return this.prisma.commissionRule.create({
      data: {
        vendorId: scope.vendorId,
        categoryId: scope.categoryId,
        productId: scope.productId,
        commissionType: dto.commissionType,
        commissionValue: dto.commissionValue,
        priority: dto.priority ?? scope.priority,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
      include: this.defaultInclude(),
    });
  }

  async findAll(query: CommissionRuleQueryDto) {
    const pagination = getPagination({ page: query.page, limit: query.limit });
    const where: Prisma.CommissionRuleWhereInput = {
      vendorId: query.vendorId,
      categoryId: query.categoryId,
      productId: query.productId,
      commissionType: query.commissionType,
      isActive: query.isActive,
      OR: query.search
        ? [
            { vendor: { name: { contains: query.search, mode: 'insensitive' } } },
            { vendor: { email: { contains: query.search, mode: 'insensitive' } } },
            { category: { name: { contains: query.search, mode: 'insensitive' } } },
            { product: { name: { contains: query.search, mode: 'insensitive' } } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.commissionRule.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        include: this.defaultInclude(),
      }),
      this.prisma.commissionRule.count({ where }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  findOne(id: string) {
    return this.prisma.commissionRule.findUniqueOrThrow({
      where: { id },
      include: this.defaultInclude(),
    });
  }

  async update(id: string, dto: UpdateCommissionRuleDto) {
    const current = await this.prisma.commissionRule.findUniqueOrThrow({
      where: { id },
    });
    const next = {
      vendorId: dto.vendorId !== undefined ? dto.vendorId : current.vendorId,
      categoryId:
        dto.categoryId !== undefined ? dto.categoryId : current.categoryId,
      productId: dto.productId !== undefined ? dto.productId : current.productId,
    };
    const scope = await this.resolveScope(next);
    const commissionType = dto.commissionType ?? current.commissionType;
    const commissionValue =
      dto.commissionValue !== undefined
        ? dto.commissionValue
        : Number(current.commissionValue);
    const startsAt =
      dto.startsAt !== undefined
        ? dto.startsAt
        : current.startsAt?.toISOString();
    const endsAt =
      dto.endsAt !== undefined ? dto.endsAt : current.endsAt?.toISOString();
    const isActive = dto.isActive ?? current.isActive;

    this.validateCommissionValue(commissionType, commissionValue);
    this.validateDateRange(startsAt, endsAt);

    if (isActive) {
      await this.assertNoActiveConflict(scope, id);
    }

    return this.prisma.commissionRule.update({
      where: { id },
      data: {
        vendorId: scope.vendorId,
        categoryId: scope.categoryId,
        productId: scope.productId,
        commissionType: dto.commissionType,
        commissionValue: dto.commissionValue,
        priority: dto.priority ?? (this.scopeChanged(current, scope) ? scope.priority : undefined),
        isActive: dto.isActive,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
      include: this.defaultInclude(),
    });
  }

  activate(id: string) {
    return this.update(id, { isActive: true });
  }

  deactivate(id: string) {
    return this.prisma.commissionRule.update({
      where: { id },
      data: { isActive: false },
      include: this.defaultInclude(),
    });
  }

  remove(id: string) {
    return this.deactivate(id);
  }

  async findForVendor(vendorId: string) {
    await this.assertVendorExists(vendorId);

    return this.prisma.commissionRule.findMany({
      where: {
        OR: [
          { vendorId },
          {
            product: {
              vendorId,
            },
          },
        ],
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      include: this.defaultInclude(),
    });
  }

  calculatePreview(dto: CommissionPreviewDto) {
    return this.calculateCommission({
      vendorId: dto.vendorId,
      categoryId: dto.categoryId,
      productId: dto.productId,
      price: dto.price,
      quantity: dto.quantity,
    });
  }

  async resolveCommissionRule(params: ResolveParams) {
    const date = params.date ?? new Date();
    const activeWhere = this.activeWhere(date);
    const lookups: Array<{
      source: CommissionSource;
      where: Prisma.CommissionRuleWhereInput;
    }> = [
      {
        source: 'PRODUCT',
        where: params.productId
          ? { productId: params.productId, ...activeWhere }
          : { id: '__no_product_rule__' },
      },
      {
        source: 'VENDOR_CATEGORY',
        where: {
          vendorId: params.vendorId,
          categoryId: params.categoryId,
          productId: null,
          ...activeWhere,
        },
      },
      {
        source: 'VENDOR',
        where: {
          vendorId: params.vendorId,
          categoryId: null,
          productId: null,
          ...activeWhere,
        },
      },
      {
        source: 'CATEGORY',
        where: {
          vendorId: null,
          categoryId: params.categoryId,
          productId: null,
          ...activeWhere,
        },
      },
      {
        source: 'GLOBAL',
        where: {
          vendorId: null,
          categoryId: null,
          productId: null,
          ...activeWhere,
        },
      },
    ];

    for (const lookup of lookups) {
      const rule = await this.prisma.commissionRule.findFirst({
        where: lookup.where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      });

      if (rule) {
        return {
          rule,
          source: lookup.source,
        };
      }
    }

    return null;
  }

  async calculateCommission(params: CommissionParams) {
    const quantity = params.quantity ?? 1;
    const price = new Prisma.Decimal(params.price);

    if (price.lte(0)) {
      throw new BadRequestException('price must be greater than 0');
    }

    if (quantity <= 0) {
      throw new BadRequestException('quantity must be greater than 0');
    }

    await this.assertCommissionContext(params);

    const subtotal = price.mul(quantity);
    const matched = await this.resolveCommissionRule(params);

    if (!matched) {
      throw new BadRequestException('No active commission rule is configured');
    }

    const commissionValue = new Prisma.Decimal(matched.rule.commissionValue);
    let commissionAmount =
      matched.rule.commissionType === CommissionType.PERCENTAGE
        ? subtotal.mul(commissionValue).div(100)
        : commissionValue;

    if (commissionAmount.lt(0)) {
      commissionAmount = new Prisma.Decimal(0);
    }

    if (commissionAmount.gt(subtotal)) {
      commissionAmount = subtotal;
    }

    const vendorEarning = subtotal.minus(commissionAmount);

    return {
      ruleId: matched.rule.id,
      matchedRule: {
        id: matched.rule.id,
        source: matched.source,
      },
      source: matched.source,
      commissionType: matched.rule.commissionType,
      commissionValue: commissionValue.toNumber(),
      commissionAmount: commissionAmount.toDecimalPlaces(2).toNumber(),
      vendorEarning: vendorEarning.toDecimalPlaces(2).toNumber(),
      subtotal: subtotal.toDecimalPlaces(2).toNumber(),
    };
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
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          vendorId: true,
          categoryId: true,
        },
      },
    } as const;
  }

  private async resolveScope(input: {
    vendorId?: string | null;
    categoryId?: string | null;
    productId?: string | null;
  }): Promise<RuleScope> {
    if (input.productId) {
      const product = await this.prisma.product.findUniqueOrThrow({
        where: { id: input.productId },
        select: { vendorId: true, categoryId: true },
      });

      if (input.vendorId && input.vendorId !== product.vendorId) {
        throw new BadRequestException('vendorId does not match selected product');
      }

      if (input.categoryId && input.categoryId !== product.categoryId) {
        throw new BadRequestException('categoryId does not match selected product');
      }

      return {
        source: 'PRODUCT',
        vendorId: input.vendorId ?? null,
        categoryId: input.categoryId ?? null,
        productId: input.productId,
        priority: 1,
      };
    }

    if (input.vendorId) {
      await this.assertVendorExists(input.vendorId);
    }

    if (input.categoryId) {
      await this.assertCategoryExists(input.categoryId);
    }

    if (input.vendorId && input.categoryId) {
      return {
        source: 'VENDOR_CATEGORY',
        vendorId: input.vendorId,
        categoryId: input.categoryId,
        productId: null,
        priority: 2,
      };
    }

    if (input.vendorId) {
      return {
        source: 'VENDOR',
        vendorId: input.vendorId,
        categoryId: null,
        productId: null,
        priority: 3,
      };
    }

    if (input.categoryId) {
      return {
        source: 'CATEGORY',
        vendorId: null,
        categoryId: input.categoryId,
        productId: null,
        priority: 4,
      };
    }

    return {
      source: 'GLOBAL',
      vendorId: null,
      categoryId: null,
      productId: null,
      priority: 5,
    };
  }

  private async assertNoActiveConflict(scope: RuleScope, ignoreId?: string) {
    const existing = await this.prisma.commissionRule.findFirst({
      where: {
        id: ignoreId ? { not: ignoreId } : undefined,
        isActive: true,
        ...this.scopeWhere(scope),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        `An active ${scope.source.toLowerCase()} commission rule already exists`,
      );
    }
  }

  private scopeWhere(scope: RuleScope): Prisma.CommissionRuleWhereInput {
    if (scope.source === 'PRODUCT') {
      return { productId: scope.productId };
    }

    return {
      vendorId: scope.vendorId,
      categoryId: scope.categoryId,
      productId: null,
    };
  }

  private validateCommissionValue(type: CommissionType, value: number) {
    if (value <= 0) {
      throw new BadRequestException('commissionValue must be greater than 0');
    }

    if (type === CommissionType.PERCENTAGE && value > 100) {
      throw new BadRequestException('percentage commission cannot exceed 100');
    }
  }

  private validateDateRange(startsAt?: string, endsAt?: string) {
    if (!startsAt || !endsAt) {
      return;
    }

    if (new Date(startsAt) > new Date(endsAt)) {
      throw new BadRequestException('startsAt must be before endsAt');
    }
  }

  private activeWhere(date: Date): Prisma.CommissionRuleWhereInput {
    return {
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: date } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: date } }] }],
    };
  }

  private async assertVendorExists(vendorId: string) {
    const vendor = await this.prisma.user.findFirst({
      where: { id: vendorId, role: UserRole.VENDOR },
      select: { id: true },
    });

    if (!vendor) {
      throw new BadRequestException('Selected vendor does not exist');
    }
  }

  private async assertCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException('Selected category does not exist');
    }
  }

  private async assertCommissionContext(params: ResolveParams) {
    await this.assertVendorExists(params.vendorId);
    await this.assertCategoryExists(params.categoryId);

    if (!params.productId) {
      return;
    }

    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: params.productId },
      select: { vendorId: true, categoryId: true },
    });

    if (
      product.vendorId !== params.vendorId ||
      product.categoryId !== params.categoryId
    ) {
      throw new BadRequestException(
        'Selected product does not match vendor/category context',
      );
    }
  }

  private scopeChanged(current: CommissionRule, scope: RuleScope) {
    return (
      current.vendorId !== scope.vendorId ||
      current.categoryId !== scope.categoryId ||
      current.productId !== scope.productId
    );
  }
}
