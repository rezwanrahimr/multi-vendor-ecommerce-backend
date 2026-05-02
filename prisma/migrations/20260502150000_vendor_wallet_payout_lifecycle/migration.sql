-- Vendor wallet settlement and payout lifecycle support.

ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'ORDER_EARNING';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'PAYOUT_REQUEST';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'PAYOUT_PAID';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'PAYOUT_REJECTED';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'ADJUSTMENT';

ALTER TABLE "Wallet" ADD COLUMN "totalEarned" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Wallet" ADD COLUMN "totalWithdrawn" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "WalletTransaction" ADD COLUMN "orderId" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN "withdrawalRequestId" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN "balanceBefore" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "WalletTransaction" ADD COLUMN "balanceAfter" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "WalletTransaction" ADD COLUMN "note" TEXT;

ALTER TABLE "WithdrawalRequest" ADD COLUMN "accountName" TEXT;
ALTER TABLE "WithdrawalRequest" ADD COLUMN "adminNote" TEXT;
ALTER TABLE "WithdrawalRequest" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "WithdrawalRequest" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "WithdrawalRequest" ADD COLUMN "payoutTransactionId" TEXT;

CREATE INDEX "WalletTransaction_orderId_idx" ON "WalletTransaction"("orderId");
CREATE INDEX "WalletTransaction_withdrawalRequestId_idx" ON "WalletTransaction"("withdrawalRequestId");
CREATE UNIQUE INDEX "WalletTransaction_walletId_type_orderId_key" ON "WalletTransaction"("walletId", "type", "orderId");
CREATE UNIQUE INDEX "WalletTransaction_walletId_type_withdrawalRequestId_key" ON "WalletTransaction"("walletId", "type", "withdrawalRequestId");
CREATE INDEX "WithdrawalRequest_approvedById_idx" ON "WithdrawalRequest"("approvedById");

ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
