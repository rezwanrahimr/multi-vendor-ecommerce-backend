import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnvFile(fileName: string) {
  const filePath = resolve(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').replace(/^["']|["']$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.test');

const originalDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for e2e tests. Copy .env.test.example to .env.test and use a separate test database.',
  );
}

if (originalDatabaseUrl && originalDatabaseUrl === testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}

if (originalDatabaseUrl) {
  process.env.ORIGINAL_DATABASE_URL = originalDatabaseUrl;
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '1h';
process.env.PRISMA_CONNECT_ON_INIT = 'false';
