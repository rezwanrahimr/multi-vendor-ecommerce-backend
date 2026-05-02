import {
  DeliveryStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
} from '@prisma/client';
import { createDeliveryZone } from './delivery-zone.factory';
import { createProduct } from './product.factory';
import { createCustomer } from './users.factory';

let sequence = 0;

type OrderFactoryOverrides = {
  id?: string;
  orderNumber?: string;
  customerId?: string;
  deliveryManId?: string | null;
  deliveryZoneId?: string | null;
  status?: OrderStatus;
  deliveryStatus?: DeliveryStatus;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  deliveryType?: string;
  subtotal?: number;
  deliveryCharge?: number;
  discountAmount?: number;
  total?: number;
  shippingAddress?: Record<string, unknown>;
  customerNote?: string | null;
};

export async function createOrder(
  prisma: PrismaClient,
  overrides: OrderFactoryOverrides = {},
) {
  sequence += 1;
  const customerId = overrides.customerId ?? (await createCustomer(prisma)).id;
  const product = await createProduct(prisma, { stock: 20 });
  const deliveryZoneId =
    overrides.deliveryZoneId ?? (await createDeliveryZone(prisma)).id;
  const subtotal = 200;
  const deliveryCharge = 50;
  const total = 250;

  return prisma.order.create({
    data: {
      orderNumber: `TEST-${Date.now()}-${sequence}`,
      customerId,
      deliveryZoneId,
      status: OrderStatus.PENDING,
      deliveryStatus: DeliveryStatus.NOT_ASSIGNED,
      paymentMethod: PaymentMethod.COD,
      paymentStatus: PaymentStatus.UNPAID,
      subtotal,
      deliveryCharge,
      discountAmount: 0,
      total,
      shippingAddress: {
        fullName: 'Test Customer',
        phone: '01700000000',
        addressLine: 'Feni Sadar',
      },
      items: {
        create: [
          {
            productId: product.id,
            vendorId: product.vendorId,
            storeId: product.storeId,
            productName: product.name,
            quantity: 1,
            unitPrice: 200,
            priceSnapshot: 200,
            totalPrice: 200,
            subtotal: 200,
            commissionValue: 10,
            adminCommission: 20,
            commissionAmount: 20,
            vendorEarning: 180,
          },
        ],
      },
      ...overrides,
    },
    include: {
      items: true,
    },
  });
}
