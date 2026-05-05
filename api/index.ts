import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { NestExpressApplication } from '@nestjs/platform-express';
import express, { Request, Response } from 'express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

let cachedServer: ReturnType<typeof express> | null = null;

async function createServer() {
  const server = express();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
  );

  configureApp(app);
  await app.init();

  return server;
}

export default async function handler(req: Request, res: Response) {
  if (!cachedServer) {
    cachedServer = await createServer();
  }

  return cachedServer(req, res);
}