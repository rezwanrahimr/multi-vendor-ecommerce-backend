-- Preserve existing banner destination data, then remove unused campaign fields.
ALTER TABLE "HomeBanner" ADD COLUMN "redirectLink" TEXT NOT NULL DEFAULT '/products';

UPDATE "HomeBanner"
SET "redirectLink" = COALESCE("ctaLink", '/products');

DROP INDEX IF EXISTS "HomeBanner_status_idx";
DROP INDEX IF EXISTS "HomeBanner_sortOrder_idx";
DROP INDEX IF EXISTS "HomeBanner_startsAt_endsAt_idx";

ALTER TABLE "HomeBanner"
  DROP COLUMN "eyebrow",
  DROP COLUMN "title",
  DROP COLUMN "subtitle",
  DROP COLUMN "ctaLabel",
  DROP COLUMN "ctaLink",
  DROP COLUMN "status",
  DROP COLUMN "sortOrder",
  DROP COLUMN "startsAt",
  DROP COLUMN "endsAt";

DROP TYPE IF EXISTS "HomeBannerStatus";
