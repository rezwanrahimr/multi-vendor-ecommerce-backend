CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx" ON "Product" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_sku_trgm_idx" ON "Product" USING GIN ("sku" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_description_trgm_idx" ON "Product" USING GIN ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Store_name_trgm_idx" ON "Store" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Category_name_trgm_idx" ON "Category" USING GIN ("name" gin_trgm_ops);
