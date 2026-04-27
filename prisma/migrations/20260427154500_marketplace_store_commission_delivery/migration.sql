-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "StoreVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StockLogType" AS ENUM ('INCREASE', 'DECREASE');

-- CreateEnum
CREATE TYPE "DeliveryAreaStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "logoPublicId" TEXT,
    "bannerUrl" TEXT,
    "bannerPublicId" TEXT,
    "phone" TEXT,
    "address" JSONB,
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "verificationStatus" "StoreVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- Backfill one store for every vendor and every existing product owner.
INSERT INTO "Store" (
    "id",
    "vendorId",
    "name",
    "slug",
    "verificationStatus",
    "createdAt",
    "updatedAt"
)
SELECT
    "User"."id",
    "User"."id",
    COALESCE(NULLIF("User"."name", ''), 'Vendor') || '''s Store',
    'store-' || lower(regexp_replace("User"."id", '[^a-zA-Z0-9]+', '-', 'g')),
    'PENDING'::"StoreVerificationStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User"
WHERE "User"."role" = 'VENDOR'
   OR EXISTS (
        SELECT 1
        FROM "Product"
        WHERE "Product"."vendorId" = "User"."id"
   )
ON CONFLICT ("id") DO NOTHING;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "storeId" TEXT;

-- Backfill products to the store created for their current vendor.
UPDATE "Product"
SET "storeId" = "vendorId"
WHERE "storeId" IS NULL;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "storeId" SET NOT NULL;

-- CreateTable
CREATE TABLE "StockLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "changedById" TEXT,
    "type" "StockLogType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousStock" INTEGER NOT NULL,
    "newStock" INTEGER NOT NULL,
    "reason" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryArea" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "district" TEXT NOT NULL DEFAULT 'Feni',
    "city" TEXT NOT NULL DEFAULT 'Feni',
    "fee" DECIMAL(10,2) NOT NULL,
    "estimatedDeliveryTime" TEXT,
    "status" "DeliveryAreaStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryArea_pkey" PRIMARY KEY ("id")
);

-- Seed the core Feni delivery zones used by the API.
INSERT INTO "DeliveryArea" ("id", "name", "slug", "fee", "estimatedDeliveryTime")
VALUES
    ('feni-sadar', 'Feni Sadar', 'feni-sadar', 60, '1-2 days'),
    ('chhagalnaiya', 'Chhagalnaiya', 'chhagalnaiya', 90, '1-2 days'),
    ('daganbhuiyan', 'Daganbhuiyan', 'daganbhuiyan', 90, '1-2 days'),
    ('parshuram', 'Parshuram', 'parshuram', 100, '1-2 days'),
    ('fulgazi', 'Fulgazi', 'fulgazi', 100, '1-2 days'),
    ('sonagazi', 'Sonagazi', 'sonagazi', 110, '1-2 days')
ON CONFLICT DO NOTHING;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "deliveryAreaId" TEXT,
ADD COLUMN "vendorSettledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "storeId" TEXT,
ADD COLUMN "adminCommission" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "vendorEarning" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill order items from their related product and existing totals.
UPDATE "OrderItem"
SET
    "storeId" = "Product"."storeId",
    "adminCommission" = ROUND(("OrderItem"."totalPrice" * "Store"."commissionRate" / 100)::numeric, 2),
    "vendorEarning" = "OrderItem"."totalPrice" - ROUND(("OrderItem"."totalPrice" * "Store"."commissionRate" / 100)::numeric, 2)
FROM "Product"
JOIN "Store" ON "Store"."id" = "Product"."storeId"
WHERE "OrderItem"."productId" = "Product"."id"
  AND "OrderItem"."storeId" IS NULL;

-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "storeId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Store_vendorId_key" ON "Store"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE INDEX "Store_vendorId_idx" ON "Store"("vendorId");

-- CreateIndex
CREATE INDEX "Store_status_idx" ON "Store"("status");

-- CreateIndex
CREATE INDEX "Store_verificationStatus_idx" ON "Store"("verificationStatus");

-- CreateIndex
CREATE INDEX "Product_storeId_idx" ON "Product"("storeId");

-- CreateIndex
CREATE INDEX "StockLog_productId_idx" ON "StockLog"("productId");

-- CreateIndex
CREATE INDEX "StockLog_storeId_idx" ON "StockLog"("storeId");

-- CreateIndex
CREATE INDEX "StockLog_changedById_idx" ON "StockLog"("changedById");

-- CreateIndex
CREATE INDEX "StockLog_type_idx" ON "StockLog"("type");

-- CreateIndex
CREATE INDEX "StockLog_reference_idx" ON "StockLog"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryArea_slug_key" ON "DeliveryArea"("slug");

-- CreateIndex
CREATE INDEX "DeliveryArea_status_idx" ON "DeliveryArea"("status");

-- CreateIndex
CREATE INDEX "DeliveryArea_district_city_idx" ON "DeliveryArea"("district", "city");

-- CreateIndex
CREATE INDEX "Order_deliveryAreaId_idx" ON "Order"("deliveryAreaId");

-- CreateIndex
CREATE INDEX "Order_vendorSettledAt_idx" ON "Order"("vendorSettledAt");

-- CreateIndex
CREATE INDEX "OrderItem_storeId_idx" ON "OrderItem"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_walletId_type_reference_key" ON "WalletTransaction"("walletId", "type", "reference");

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryAreaId_fkey" FOREIGN KEY ("deliveryAreaId") REFERENCES "DeliveryArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
