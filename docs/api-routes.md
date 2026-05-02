# HelloFeni API Routes

Base path: `/api/v1`

## Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/social-login`
- `GET /auth/me`

## Users

- `GET /users/me`
- `PATCH /users/me`
- `PATCH /users/me/change-password`
- Admin user management routes under `/users`

## Vendors

- `GET /vendor/store`
- `PATCH /vendor/store`
- `GET /admin/vendors`
- `GET /admin/vendors/:id`
- `PATCH /admin/vendors/:id/approve`
- `PATCH /admin/vendors/:id/reject`
- `PATCH /admin/vendors/:id/suspend`
- `PATCH /admin/vendors/:id/activate`

## Products

- `GET /products`
- `GET /products/:id`
- `POST /vendor/products`
- `GET /vendor/products`
- `GET /vendor/products/:id`
- `PATCH /vendor/products/:id`
- `DELETE /vendor/products/:id`
- `GET /admin/products`
- `GET /admin/products/:id`
- `PATCH /admin/products/:id/approve`
- `PATCH /admin/products/:id/reject`
- `PATCH /admin/products/:id/activate`
- `PATCH /admin/products/:id/deactivate`

## Categories

- `GET /categories`
- `GET /categories/:id`
- `POST /admin/categories`
- `PATCH /admin/categories/:id`
- `PATCH /admin/categories/:id/activate`
- `PATCH /admin/categories/:id/deactivate`
- `DELETE /admin/categories/:id`

## Cart and Checkout

- `GET /cart`
- `POST /cart/items`
- `PATCH /cart/items/:id`
- `DELETE /cart/items/:id`
- `DELETE /cart/clear`
- `POST /checkout/calculate`
- `POST /checkout/validate-coupon`

## Coupons

- `GET /coupons/active`
- `POST /admin/coupons`
- `GET /admin/coupons`
- `GET /admin/coupons/:id`
- `PATCH /admin/coupons/:id`
- `PATCH /admin/coupons/:id/activate`
- `PATCH /admin/coupons/:id/deactivate`
- `DELETE /admin/coupons/:id`

## Orders

- `POST /orders`
- `GET /orders`
- `GET /orders/:id`
- `PATCH /orders/:id/cancel`
- `GET /vendor/orders`
- `GET /vendor/orders/:id`
- `PATCH /vendor/orders/:id/status`
- `GET /admin/orders`
- `GET /admin/orders/:id`
- `PATCH /admin/orders/:id/status`
- `PATCH /admin/orders/:id/assign-delivery`
- `PATCH /admin/orders/:id/verify-cod-payment`
- `POST /admin/orders/:id/settle-wallet`

## Delivery

- `GET /delivery-zones`
- `GET /delivery-zones/:id`
- `POST /delivery-zones/calculate-charge`
- `POST /admin/delivery-zones`
- `GET /admin/delivery-zones`
- `GET /admin/delivery-zones/:id`
- `PATCH /admin/delivery-zones/:id`
- `PATCH /admin/delivery-zones/:id/activate`
- `PATCH /admin/delivery-zones/:id/deactivate`
- `DELETE /admin/delivery-zones/:id`
- `GET /delivery/dashboard`
- `GET /delivery/orders`
- `GET /delivery/orders/:id`
- `PATCH /delivery/orders/:id/status`
- `GET /admin/deliveries`
- `GET /admin/deliveries/:orderId`

## Payments

- `POST /orders/:orderId/manual-payment`
- `GET /orders/:orderId/payment`
- `GET /admin/payments`
- `GET /admin/payments/:id`
- `PATCH /admin/payments/:id/verify`
- `PATCH /admin/payments/:id/verify-cod`
- `PATCH /admin/payments/:id/reject`
- `PATCH /admin/payments/:id/reject-cod`
- `GET /payments/:id`
- `POST /payments/webhook`

## Reviews

- `POST /products/:productId/reviews`
- `GET /products/:productId/reviews`
- `GET /products/:productId/rating-summary`
- `GET /customer/reviews`
- `PATCH /customer/reviews/:id`
- `DELETE /customer/reviews/:id`
- `GET /vendor/reviews`
- `GET /admin/reviews`
- `PATCH /admin/reviews/:id/approve`
- `PATCH /admin/reviews/:id/hide`
- `DELETE /admin/reviews/:id`

## Notifications

- `GET /notifications`
- `GET /notifications/unread-count`
- `PATCH /notifications/:id/read`
- `PATCH /notifications/read-all`
- `DELETE /notifications/:id`

## Audit Logs

- `GET /admin/audit-logs`
- `GET /admin/audit-logs/:id`

## Wallets and Payouts

- `GET /vendor/wallet`
- `GET /vendor/wallet/transactions`
- `GET /wallets/me`
- `POST /vendor/payouts`
- `GET /vendor/payouts`
- `GET /vendor/payouts/:id`
- `GET /admin/wallets`
- `GET /admin/wallets/:vendorId`
- `GET /admin/payouts`
- `GET /admin/payouts/:id`
- `PATCH /admin/payouts/:id/approve`
- `PATCH /admin/payouts/:id/reject`
- `PATCH /admin/payouts/:id/mark-paid`

## Commissions

- `POST /admin/commission-rules`
- `GET /admin/commission-rules`
- `GET /admin/commission-rules/:id`
- `PATCH /admin/commission-rules/:id`
- `PATCH /admin/commission-rules/:id/activate`
- `PATCH /admin/commission-rules/:id/deactivate`
- `DELETE /admin/commission-rules/:id`
- `POST /admin/commission-rules/preview`
- `GET /admin/vendors/:vendorId/commission-rules`

## Dashboard

- `GET /admin/dashboard`
- `GET /vendor/dashboard`
- `GET /delivery/dashboard`
- `GET /customer/dashboard`

## System

- `GET /health`
- `GET /api/docs`
