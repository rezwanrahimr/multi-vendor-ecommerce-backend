-- Delivery system hardening and COD cash collection preparation.

ALTER TABLE "Order" ADD COLUMN "deliveryNote" TEXT;
ALTER TABLE "Order" ADD COLUMN "failedReason" TEXT;

ALTER TABLE "Payment" ADD COLUMN "cashCollectedAmount" DECIMAL(10,2);
ALTER TABLE "Payment" ADD COLUMN "cashCollectedById" TEXT;
ALTER TABLE "Payment" ADD COLUMN "cashCollectedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "cashCollectionNote" TEXT;

CREATE INDEX "Payment_cashCollectedById_idx" ON "Payment"("cashCollectedById");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashCollectedById_fkey" FOREIGN KEY ("cashCollectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
