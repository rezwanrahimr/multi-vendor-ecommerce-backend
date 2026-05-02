# HelloFeni Permission Matrix

This matrix captures the intended access rules for the current backend routes. Keep it updated whenever a controller changes.

## Public Routes

| Area | Routes | Notes |
| --- | --- | --- |
| System | `GET /`, `GET /api/v1/health`, `GET /api/docs` | Health checks must not expose secrets. |
| Auth | `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/social-login` | Register is limited to `CUSTOMER` and `VENDOR`; social login is disabled until server-side provider verification exists. |
| Catalog | `GET /api/v1/products`, `GET /api/v1/products/:id`, `GET /api/v1/categories`, `GET /api/v1/delivery-zones`, `POST /api/v1/delivery-zones/calculate-charge` | Public catalog must return active/approved products, active categories, and active vendor stores only. |
| Content | `GET /api/v1/home-banners`, `GET /api/v1/reviews` | Admin-only mutations are protected separately. |

## Customer Routes

| Area | Routes | Required Protection |
| --- | --- | --- |
| Profile | `GET /api/v1/users/me`, `PATCH /api/v1/users/me`, `PATCH /api/v1/users/me/change-password` | `JwtAuthGuard`; user can update only safe own fields. |
| Cart | `GET /api/v1/cart`, `POST /api/v1/cart/items`, `PATCH /api/v1/cart/items/:id`, `DELETE /api/v1/cart/items/:id`, `DELETE /api/v1/cart/clear` | `JwtAuthGuard`, `RolesGuard`, `CUSTOMER`; own cart only. |
| Checkout | `POST /api/v1/checkout/calculate` | `CUSTOMER`; totals, delivery charge, and commission are backend-calculated. |
| Orders | `POST /api/v1/orders`, `GET /api/v1/orders`, `GET /api/v1/orders/:id`, `PATCH /api/v1/orders/:id/cancel` | `CUSTOMER`; own orders only. |
| Payments | `POST /api/v1/orders/:orderId/manual-payment`, `GET /api/v1/orders/:orderId/payment` | `CUSTOMER`; own order only; cannot set `PAID`. |
| Dashboard | `GET /api/v1/customer/dashboard` | `CUSTOMER`; own data only. |
| Reviews | Customer review routes | `CUSTOMER`; delivered own products only where enforced by service. |

## Vendor Routes

| Area | Routes | Required Protection |
| --- | --- | --- |
| Store | `GET /api/v1/vendor/store`, `PATCH /api/v1/vendor/store` | `VENDOR`; own store only; no approval/wallet/admin fields. |
| Products | `POST /api/v1/vendor/products`, `GET /api/v1/vendor/products`, `GET /api/v1/vendor/products/:id`, `PATCH /api/v1/vendor/products/:id`, `DELETE /api/v1/vendor/products/:id` | `VENDOR`; own products only; approved store required to create. |
| Orders | `GET /api/v1/vendor/orders`, `GET /api/v1/vendor/orders/:id`, `PATCH /api/v1/vendor/orders/:id/status` | `VENDOR`; only orders containing own items. |
| Wallet | `GET /api/v1/vendor/wallet`, `GET /api/v1/vendor/wallet/transactions`, `GET /api/v1/wallets/me` | `VENDOR`; own wallet only. |
| Payouts | `POST /api/v1/vendor/payouts`, `GET /api/v1/vendor/payouts`, `GET /api/v1/vendor/payouts/:id` | `VENDOR`; own payout requests only. |
| Dashboard | `GET /api/v1/vendor/dashboard` | `VENDOR`; own store/products/order items/wallet only. |

## Delivery Man Routes

| Area | Routes | Required Protection |
| --- | --- | --- |
| Delivery | `GET /api/v1/delivery/dashboard`, `GET /api/v1/delivery/orders`, `GET /api/v1/delivery/orders/:id`, `PATCH /api/v1/delivery/orders/:id/status` | `DELIVERY_MAN`; assigned orders only. |

## Admin Routes

| Area | Routes | Required Protection |
| --- | --- | --- |
| Admin overview | `GET /api/v1/admin/dashboard`, admin reports | `ADMIN`; all platform data. |
| Users/admin | `/api/v1/users/*`, `/api/v1/admin/*` | `ADMIN`; never return password hashes. |
| Vendors | `/api/v1/admin/vendors*` | `ADMIN`; approval, rejection, suspend, activate. |
| Products/categories | `/api/v1/admin/products*`, `/api/v1/admin/categories*` | `ADMIN`; catalog moderation. |
| Delivery zones | `/api/v1/admin/delivery-zones*` | `ADMIN`; delivery charge control. |
| Commission | `/api/v1/admin/commission-rules*` | `ADMIN`; backend-only commission rules. |
| Orders/delivery | `/api/v1/admin/orders*`, `/api/v1/admin/deliveries*` | `ADMIN`; all order and delivery operations. |
| Payments | `/api/v1/admin/payments*`, `/api/v1/payments/*` | `ADMIN`; manual verification only. |
| Wallets/payouts | `/api/v1/admin/wallets*`, `/api/v1/admin/payouts*` | `ADMIN`; settlement and payout lifecycle. |

## Audit Notes

- All role-specific controllers currently use `JwtAuthGuard` and `RolesGuard`.
- Ownership checks are service-level for customer orders/cart/payments, vendor store/products/order items/wallet/payouts, and delivery assignments.
- Generic payment routes are admin-protected and automatic webhooks intentionally reject requests.
