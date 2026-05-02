# HelloFeni Testing Checklist

Use this as both the automated test guide and the manual Postman/Thunder Client checklist.

## Test Database Setup

E2E tests must use a separate database.

1. Create a PostgreSQL database for tests only.
2. Copy `.env.test.example` to `.env.test`.
3. Set `TEST_DATABASE_URL` to the test database URL.
4. Make sure `TEST_DATABASE_URL` is not the same as `DATABASE_URL`.
5. Run migrations against the test database:

```bash
$env:DATABASE_URL=$env:TEST_DATABASE_URL
npx prisma migrate deploy
```

The e2e setup intentionally fails when `TEST_DATABASE_URL` is missing or matches the normal `DATABASE_URL`.

## Commands

```bash
npm run test
npm run test:e2e
npm run test:e2e:watch
```

## Reset Strategy

`test/helpers/reset-db.ts` truncates application tables with `RESTART IDENTITY CASCADE` before each suite/test setup. It checks:

- `NODE_ENV=test`
- `TEST_DATABASE_URL` is set
- `TEST_DATABASE_URL` does not match the original app `DATABASE_URL`

Never point `TEST_DATABASE_URL` at production or staging data.

## Automated Coverage Added

- Auth service security unit tests.
- Payment service manual payment safety unit tests.
- Health and unauthenticated protected-route e2e smoke tests.
- Full COD order, delivery, COD verification, wallet settlement, and payout e2e flow.
- Manual bKash/Nagad proof submission, rejection, resubmission, verification, and settlement eligibility e2e flow.
- Permission/ownership regression tests.
- Cart and checkout regression tests.
- Wallet and payout money-safety tests.

## Auth

- Customer registration succeeds.
- Vendor registration succeeds.
- Public `ADMIN` registration fails validation.
- Public `DELIVERY_MAN` registration fails validation.
- Inactive or suspended user login fails.
- Wrong password fails.
- Protected route without token returns `401`.

## Vendor and Product

- Unapproved vendor cannot create product.
- Approved vendor creates product as `PENDING_REVIEW`.
- Pending product is hidden from public listing.
- Admin approves product and it appears publicly.
- Vendor cannot update another vendor product.

## Cart and Checkout

- Customer can add active approved product to cart.
- Pending/inactive product cannot be added.
- Quantity above stock fails.
- Checkout calculation ignores frontend price and uses backend price.
- Delivery charge comes from delivery zone.
- Commission comes from commission rule resolver.

## Order

- Customer creates order from cart.
- Stock decreases after successful order creation.
- Payment record is initialized.
- Customer cannot read another customer order.
- Vendor sees only own order items.
- Admin sees all orders.
- Cancellation restores stock once.

## Delivery

- Admin assigns active delivery man.
- Delivery man sees only assigned orders.
- Invalid delivery transition fails.
- COD delivered order moves payment to `PENDING_VERIFICATION`, not `PAID`.

## Payments

- Customer submits bKash/Nagad proof.
- Wrong amount fails.
- Admin verifies payment.
- Admin rejects payment with reason.
- Customer/vendor/delivery man cannot mark payment `PAID`.

## Wallet and Payout

- Admin settles only delivered and paid orders.
- Unpaid or undelivered settlement fails.
- Duplicate settlement does not credit twice.
- Vendor payout within balance succeeds.
- Payout above balance fails.
- Admin reject refunds held payout.
- Paid payout cannot be rejected.

## Dashboard

- Admin dashboard returns platform data.
- Vendor dashboard contains only own vendor data.
- Delivery dashboard contains only assigned orders.
- Customer dashboard contains only own orders.

## Still Useful for Manual QA

- File upload behavior for category/product/store images with real Cloudinary credentials.
- Browser-facing CORS behavior from the deployed frontend domain.
- High-volume pagination and filter behavior.
- Dashboard chart accuracy over longer historical date ranges.
- Operational behavior of `npx prisma migrate status` in the deployment environment.
