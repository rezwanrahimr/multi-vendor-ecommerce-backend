-- CreateEnum
CREATE TYPE "HomeBannerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "HomeBanner" (
    "id" TEXT NOT NULL,
    "eyebrow" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "ctaLabel" TEXT NOT NULL DEFAULT 'Shop Now',
    "ctaLink" TEXT NOT NULL DEFAULT '/products',
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT,
    "status" "HomeBannerStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeBanner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomeBanner_status_idx" ON "HomeBanner"("status");

-- CreateIndex
CREATE INDEX "HomeBanner_sortOrder_idx" ON "HomeBanner"("sortOrder");

-- CreateIndex
CREATE INDEX "HomeBanner_startsAt_endsAt_idx" ON "HomeBanner"("startsAt", "endsAt");
