import { CommissionType, PrismaClient } from '@prisma/client';

type CommissionRuleFactoryOverrides = {
  id?: string;
  vendorId?: string | null;
  categoryId?: string | null;
  productId?: string | null;
  commissionType?: CommissionType;
  commissionValue?: number;
  priority?: number;
  isActive?: boolean;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
};

export function createCommissionRule(
  prisma: PrismaClient,
  overrides: CommissionRuleFactoryOverrides = {},
) {
  return prisma.commissionRule.create({
    data: {
      commissionType: CommissionType.PERCENTAGE,
      commissionValue: 10,
      priority: 5,
      isActive: true,
      ...overrides,
    },
  });
}
