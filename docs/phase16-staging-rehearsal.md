# Phase 16 Staging Deployment Rehearsal

Date: 2026-05-02

## Safety Gate

The Phase 14 migration is still pending:

```text
20260502193000_coupons_notifications_audit_reviews
```

Migration deploy was not run in this rehearsal because the required Neon backup/snapshot was not available in this workspace and could not be confirmed from the Neon dashboard.

Before running `npx prisma migrate deploy` on staging:

1. Create a Neon backup/snapshot from the dashboard.
2. Confirm the backup exists and is restorable.
3. Record the backup timestamp below.

```text
Neon backup timestamp: NOT CONFIRMED
Backup confirmed by: NOT CONFIRMED
```

## Commands Run

```bash
npx prisma validate
npx prisma generate
npx prisma migrate status
npm run build
npm run test
```

Results:

- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- `npx prisma migrate status`: blocked by Prisma schema-engine errors against Neon in this run. Previous Phase 15 status confirmed `20260502193000_coupons_notifications_audit_reviews` as pending.
- `npx prisma migrate deploy`: not run because backup confirmation is missing.
- `npm run build`: passed.
- `npm run test`: passed.
- `npm run test:e2e`: not run because `.env.test` / `TEST_DATABASE_URL` is not configured.

## Health Check

A local built-server rehearsal was run on port `5016` and stopped afterward.

Endpoint:

```http
GET /api/v1/health
```

Observed result:

```json
{
  "status": "ok",
  "database": "ok"
}
```

The API response also included service metadata, timestamp, uptime, docs URL, and API base path.

## Post-Migration Verification

After backup confirmation and `npx prisma migrate deploy`, verify these tables and columns exist:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('Coupon', 'CouponUsage', 'Notification', 'AuditLog');

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'Review' AND column_name IN ('orderId', 'images'))
    OR (table_name = 'Order' AND column_name IN ('couponId', 'couponCode', 'couponDiscountType'))
  );
```

Then smoke test:

- Create and validate a coupon through admin/customer endpoints.
- Confirm order creation stores `couponId`, `couponCode`, `couponDiscountType`, and `discountAmount`.
- Create a review only after delivered and paid order status.
- Read and mark notifications as read.
- Confirm admin-only audit log list is protected.

## Seed Check

Production/staging seed rules:

- Run `npm run db:seed` only if baseline data is needed.
- Demo vendor/product data is skipped when `NODE_ENV=production`.
- Production/staging admin seed requires `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.
- Never use seed as a migration substitute.

## Test Database Gate

E2E tests require `.env.test` with a separate test database:

```env
NODE_ENV=test
TEST_DATABASE_URL=postgresql://...
```

Rules:

- `TEST_DATABASE_URL` must not equal `DATABASE_URL`.
- E2E setup sets `NODE_ENV=test`.
- Reset helper refuses to run outside test mode or against the normal database URL.
- Run migrations against the test database before e2e:

```powershell
$env:DATABASE_URL = (Select-String -Path .env.test -Pattern '^TEST_DATABASE_URL=').Line.Split('=', 2)[1]
npx prisma migrate deploy
npm run test:e2e
```

## Frontend Integration QA Findings

Static inspection was performed against the sibling `frontend` project.

### Customer

- Register/login: wired through `/auth/register` and `/auth/login`.
- Homepage/category/product listing: product/category reads are partially wired.
- Product details: product fetch is wired, but reviews use the old route `/reviews/product/:productId`; backend now exposes `/products/:productId/reviews`.
- Cart: currently Redux/local-state based, not backend cart endpoints.
- Checkout calculation: no frontend call to `/checkout/calculate`.
- Coupon apply: no frontend service/UI for `/coupons/active`, `/checkout/validate-coupon`, or `couponCode`.
- Order creation: frontend payload is incompatible with backend Phase 16 contract; it omits `deliveryZoneId` and `paymentMethod`, and uses `deliveryAreaId`/`deliveryFee` concepts that do not match the backend.
- Manual bKash/Nagad proof submit: no visible frontend integration found.
- Order tracking: `getMyOrders()` calls `/orders/my`, but backend route is `GET /orders`.
- Reviews: read route mismatch; create/update/delete customer review UI not found.
- Notifications: dashboard has a bell icon, but no notifications service/UI integration found.

### Vendor

- Vendor product CRUD is partially wired.
- Vendor dashboard uses static mock metrics.
- Vendor orders, wallet, payout request, dashboard data, and reviews integration were not found in the inspected services/pages.
- Product status visibility exists in product data types/pages but needs staging smoke testing.

### Delivery

- Delivery dashboard uses static mock data.
- Assigned orders, delivery status update, COD cash collection, and delivery dashboard API integration were not found.

### Admin

- Admin dashboard overview is wired to `/admin/dashboard/overview`.
- Vendor/product/category management pages exist, but category service uses public `/categories` mutation routes while backend admin routes are under `/admin/categories`.
- Coupons, review moderation, notifications, audit logs, delivery zones, commission rules, order management, payment verification, wallet settlement, and payout management frontend integrations were not found in the inspected services/pages.

## CORS, Token, and Runtime Notes

- Backend supports comma-separated `CORS_ORIGIN` or `FRONTEND_URL`.
- Frontend uses `NEXT_PUBLIC_API_BASE_URL`, defaulting to `http://localhost:5000/api/v1`.
- JWT is stored in local/session storage and sent as `Authorization: Bearer ...` by individual services.
- Protected dashboard layout currently has a TODO and does not enforce server-side auth/role redirects.
- File upload services use `FormData` safely without forcing JSON content type.

## Go/No-Go

Current status: no-go for staging migration until Neon backup is confirmed.

After backup confirmation, proceed with:

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
npm run build
```

Then configure `.env.test`, run test database migrations, and execute:

```bash
npm run test
npm run test:e2e
```

## Remaining Backend Risks

- The pending Phase 14 migration is not applied.
- `migrate status` intermittently fails with Prisma schema-engine errors against Neon from this environment.
- Full e2e suite has not run because test DB is not configured.
- Staging table verification is pending until migration deploy.

## Recommended Phase 17

Frontend integration completion and browser QA:

- Align frontend route contracts with backend Phase 14/16 APIs.
- Add checkout calculation, delivery zone selection, payment method selection, coupon apply, and order snapshot display.
- Add notifications, audit logs, coupons, review moderation, wallet/payout, delivery, and vendor dashboard API integrations.
- Add protected route redirects and role gates in frontend layout/middleware.
- Run Playwright smoke tests against staging after backend migration is applied.
