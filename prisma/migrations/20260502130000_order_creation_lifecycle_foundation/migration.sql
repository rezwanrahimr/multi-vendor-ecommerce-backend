-- Add order/payment snapshot fields needed for order creation lifecycle.

ALTER TABLE "Order" ADD COLUMN "deliveryType" TEXT NOT NULL DEFAULT 'NORMAL';

ALTER TABLE "OrderItem" ADD COLUMN "productName" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "commissionRuleId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "commissionSource" TEXT;

ALTER TABLE "Payment" ADD COLUMN "customerId" TEXT;

CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
