import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    const startedAt = Date.now();

    response.on('finish', () => {
      const elapsedMs = Date.now() - startedAt;
      console.log(`${request.method} ${request.originalUrl} ${response.statusCode} - ${elapsedMs}ms`);
    });

    next();
  }
}
