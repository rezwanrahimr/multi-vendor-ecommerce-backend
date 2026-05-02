import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { createE2eApp } from './helpers/e2e-app';
import { resetDatabase } from './helpers/reset-db';

describe('System health (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns database-aware health status', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      database: 'ok',
    });
    expect(response.body.timestamp).toBeDefined();
  });

  it('rejects protected routes without a token', async () => {
    await request(app.getHttpServer()).get('/api/v1/orders').expect(401);
  });
});
