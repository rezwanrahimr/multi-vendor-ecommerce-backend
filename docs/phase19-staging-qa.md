# Phase 19 Staging QA Notes

## Migration Gate

The staging database must not be reset. Before applying `20260502193000_coupons_notifications_audit_reviews`, confirm a Neon backup/snapshot exists and record the timestamp below.

- Backup timestamp: `TBD - confirm in Neon dashboard before deploy`
- Migration command: `npx prisma migrate deploy`
- Health check: `GET /api/v1/health`

If a backup cannot be confirmed, do not apply the migration.

## QA Accounts

Create or verify these accounts in staging before browser QA:

| Role | Email | Password | Required State |
| --- | --- | --- | --- |
| Admin | `TBD` | `TBD` | Active admin user |
| Customer | `TBD` | `TBD` | Active customer |
| Vendor | `TBD` | `TBD` | Active vendor with approved store |
| Delivery man | `TBD` | `TBD` | Active delivery man |

Required data:

- At least one active delivery zone.
- At least one active global commission rule.
- At least one approved active vendor product.
- Optional active coupon for checkout QA.

## Browser QA Scope

- Customer: login, browse products, cart, checkout calculation, coupon, COD order, manual payment proof, notifications, review after delivered and paid.
- Admin: vendor/product/category management, delivery zones, commission rules, delivery assignment, payments, COD verification, wallet settlement, payouts, coupons, review moderation, audit logs, notifications.
- Vendor: dashboard, store settings, products, orders, wallet transactions, payout request, reviews, notifications.
- Delivery: dashboard, assigned orders, delivery status transitions, COD cash collection, failed/returned notes, notifications.
