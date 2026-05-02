-- Phase 1 foundation for HelloFeni manual payments, delivery zones, and commission rules.
-- This migration avoids removing old PostgreSQL enum labels so existing data can be moved safely.

ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliveryStatus') THEN
    CREATE TYPE "DeliveryStatus" AS ENUM (
      'NOT_ASSIGNED',
      'ASSIGNED',
      'ACCEPTED',
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'FAILED',
      'RETURNED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMethod') THEN
    CREATE TYPE "PaymentMethod" AS ENUM ('COD', 'MANUAL_BKASH', 'MANUAL_NAGAD');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommissionType') THEN
    CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE', 'FIXED');
  END IF;
END $$;

ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
CREATE TYPE "OrderStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'READY_FOR_PICKUP',
  'ASSIGNED_TO_DELIVERY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURNED'
);
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus" USING (
  CASE "status"::text
    WHEN 'SHIPPED' THEN 'OUT_FOR_DELIVERY'
    WHEN 'REFUNDED' THEN 'RETURNED'
    ELSE "status"::text
  END
)::"OrderStatus";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';
DROP TYPE "OrderStatus_old";

ALTER TABLE "Order" ALTER COLUMN "paymentStatus" DROP DEFAULT;
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
CREATE TYPE "PaymentStatus" AS ENUM (
  'UNPAID',
  'PENDING_VERIFICATION',
  'PAID',
  'FAILED',
  'REJECTED',
  'REFUNDED'
);
ALTER TABLE "Order" ALTER COLUMN "paymentStatus" TYPE "PaymentStatus" USING (
  CASE "paymentStatus"::text
    WHEN 'PENDING' THEN 'UNPAID'
    ELSE "paymentStatus"::text
  END
)::"PaymentStatus";
ALTER TABLE "Order" ALTER COLUMN "paymentStatus" SET DEFAULT 'UNPAID';

ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_deliveryAreaId_fkey";
DROP INDEX IF EXISTS "Order_deliveryAreaId_idx";

ALTER TABLE "Order" RENAME COLUMN "deliveryFee" TO "deliveryCharge";
ALTER TABLE "Order" RENAME COLUMN "deliveryAreaId" TO "deliveryZoneId";
ALTER TABLE "Order" ADD COLUMN "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'NOT_ASSIGNED';
ALTER TABLE "Order" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'COD';

DO $$
BEGIN
  IF to_regclass('"DeliveryArea"') IS NOT NULL AND to_regclass('"DeliveryZone"') IS NULL THEN
    ALTER TABLE "DeliveryArea" RENAME TO "DeliveryZone";
  END IF;
END $$;

ALTER INDEX IF EXISTS "DeliveryArea_slug_key" RENAME TO "DeliveryZone_slug_key";
DROP INDEX IF EXISTS "DeliveryArea_status_idx";
DROP INDEX IF EXISTS "DeliveryArea_district_city_idx";

ALTER TABLE "DeliveryZone" RENAME COLUMN "city" TO "area";
ALTER TABLE "DeliveryZone" RENAME COLUMN "fee" TO "baseCharge";
ALTER TABLE "DeliveryZone" ADD COLUMN "sameDayCharge" DECIMAL(10,2);
ALTER TABLE "DeliveryZone" ADD COLUMN "freeDeliveryMinAmount" DECIMAL(10,2);
ALTER TABLE "DeliveryZone" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
UPDATE "DeliveryZone" SET "isActive" = false WHERE "status" = 'INACTIVE';
UPDATE "DeliveryZone" SET "area" = "name" WHERE "area" IS NULL OR "area" = 'Feni';
ALTER TABLE "DeliveryZone" DROP COLUMN "status";

ALTER TABLE "OrderItem" ADD COLUMN "priceSnapshot" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "commissionType" "CommissionType" NOT NULL DEFAULT 'PERCENTAGE';
ALTER TABLE "OrderItem" ADD COLUMN "commissionValue" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "commissionAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE "OrderItem"
SET
  "priceSnapshot" = "unitPrice",
  "subtotal" = "totalPrice",
  "commissionAmount" = "adminCommission";

ALTER TABLE "Payment" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'COD';
ALTER TABLE "Payment" ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID';
ALTER TABLE "Payment" ADD COLUMN "senderPhone" TEXT;
ALTER TABLE "Payment" ADD COLUMN "paymentScreenshotUrl" TEXT;
ALTER TABLE "Payment" ADD COLUMN "paymentScreenshotPublicId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "Payment" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "rejectionReason" TEXT;

UPDATE "Payment"
SET
  "paymentMethod" = CASE
    WHEN lower(coalesce("method", '')) LIKE '%bkash%' OR lower(coalesce("provider", '')) LIKE '%bkash%' THEN 'MANUAL_BKASH'::"PaymentMethod"
    WHEN lower(coalesce("method", '')) LIKE '%nagad%' OR lower(coalesce("provider", '')) LIKE '%nagad%' THEN 'MANUAL_NAGAD'::"PaymentMethod"
    ELSE 'COD'::"PaymentMethod"
  END,
  "paymentStatus" = CASE
    WHEN "status"::text = 'PENDING' THEN 'PENDING_VERIFICATION'::"PaymentStatus"
    ELSE "status"::text::"PaymentStatus"
  END;

ALTER TABLE "Payment" DROP COLUMN "method";
ALTER TABLE "Payment" DROP COLUMN "provider";
ALTER TABLE "Payment" DROP COLUMN "status";
DROP TYPE "PaymentStatus_old";
DROP TYPE IF EXISTS "DeliveryAreaStatus";

CREATE TABLE "CommissionRule" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT,
  "categoryId" TEXT,
  "productId" TEXT,
  "commissionType" "CommissionType" NOT NULL,
  "commissionValue" DECIMAL(10,2) NOT NULL,
  "priority" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Setting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Order_deliveryStatus_idx" ON "Order"("deliveryStatus");
CREATE INDEX "Order_deliveryZoneId_idx" ON "Order"("deliveryZoneId");
CREATE INDEX "DeliveryZone_isActive_idx" ON "DeliveryZone"("isActive");
CREATE INDEX "DeliveryZone_district_area_idx" ON "DeliveryZone"("district", "area");
CREATE INDEX "Payment_paymentMethod_idx" ON "Payment"("paymentMethod");
CREATE INDEX "Payment_paymentStatus_idx" ON "Payment"("paymentStatus");
CREATE INDEX "Payment_reviewedById_idx" ON "Payment"("reviewedById");
CREATE INDEX "CommissionRule_vendorId_idx" ON "CommissionRule"("vendorId");
CREATE INDEX "CommissionRule_categoryId_idx" ON "CommissionRule"("categoryId");
CREATE INDEX "CommissionRule_productId_idx" ON "CommissionRule"("productId");
CREATE INDEX "CommissionRule_isActive_idx" ON "CommissionRule"("isActive");
CREATE INDEX "CommissionRule_priority_idx" ON "CommissionRule"("priority");
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
