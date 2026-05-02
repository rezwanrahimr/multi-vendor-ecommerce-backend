import { PrismaClient } from '@prisma/client';

let sequence = 0;

type DeliveryZoneFactoryOverrides = {
  id?: string;
  name?: string;
  slug?: string;
  district?: string;
  area?: string;
  baseCharge?: number;
  sameDayCharge?: number | null;
  freeDeliveryMinAmount?: number | null;
  estimatedDeliveryTime?: string | null;
  isActive?: boolean;
};

export function createDeliveryZone(
  prisma: PrismaClient,
  overrides: DeliveryZoneFactoryOverrides = {},
) {
  sequence += 1;

  return prisma.deliveryZone.create({
    data: {
      name: `Test Zone ${sequence}`,
      slug: `test-zone-${Date.now()}-${sequence}`,
      district: 'Feni',
      area: `Area ${sequence}`,
      baseCharge: 50,
      sameDayCharge: 80,
      estimatedDeliveryTime: '24 hours',
      isActive: true,
      ...overrides,
    },
  });
}
