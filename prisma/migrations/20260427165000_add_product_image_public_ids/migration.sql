-- AlterTable
ALTER TABLE "Product" ADD COLUMN "imagePublicIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
