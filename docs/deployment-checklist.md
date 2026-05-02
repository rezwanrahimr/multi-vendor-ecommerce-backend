# HelloFeni Deployment Checklist

## 1. Install

```bash
npm ci
npx prisma generate
```

## 2. Environment Variables

Required for production:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://...
JWT_SECRET=replace-with-long-random-secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://your-frontend-domain.com
```

Required when image upload is enabled:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Optional production seed admin:

```env
SEED_ADMIN_NAME=HelloFeni Admin
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=use-a-strong-password
```

## 3. Database

For local development:

```bash
npx prisma migrate dev
npm run db:seed
```

For staging and production:

```bash
npx prisma migrate deploy
npx prisma generate
npm run db:seed
```

Before production migration:

- Take a database backup.
- Confirm `npx prisma migrate status` is clean in staging.
- Do not edit old migration files after they have been applied.
- Use idempotent seed data only.

## 4. Build and Start

```bash
npm run build
npm run start:prod
```

Health check:

```bash
GET /api/v1/health
```

Expected:

```json
{
  "status": "ok",
  "database": "ok"
}
```

## 5. Security Checks

- Use a strong `JWT_SECRET`.
- Keep `.env` out of git.
- Restrict `CORS_ORIGIN` to frontend domains.
- Verify login/register throttling after deploy.
- Confirm public registration cannot create `ADMIN` or `DELIVERY_MAN`.
- Confirm social login stays disabled until provider token verification is implemented.
- Confirm public payment creation/webhooks cannot mark payments as paid.
- Confirm upload file size/type validation before enabling public uploads in production.

## 6. Operational Checks

- Confirm admin user access.
- Confirm default delivery zones exist.
- Confirm default global commission rule exists.
- Confirm Swagger is reachable at `/api/docs` only where you want it exposed.
- Configure logs and error monitoring.
- Schedule database backups.
