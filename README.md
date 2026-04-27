# HelloFeni Backend

Nest.js, TypeScript, PostgreSQL, and Prisma base API for the HelloFeni.com multi-vendor marketplace.

## Getting started

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
npm run start:dev
```

The API uses `api/v1` as the global prefix.

## Useful URLs

- Home overview: `http://localhost:5000/`
- Health check: `http://localhost:5000/api/v1/health`
- Swagger UI: `http://localhost:5000/api/docs`
- OpenAPI JSON: `http://localhost:5000/api/docs-json`
"# multi-vendor-ecommerce-backend" 
