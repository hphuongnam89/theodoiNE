import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const accessLog = new Logger('HttpAccess');
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = randomUUID();
    const started = Date.now();
    response.setHeader('X-Request-Id', requestId);
    response.on('finish', () => {
      const route = request.route?.path;
      const routeLabel = typeof route === 'string' ? route : '<unmatched>';
      accessLog.log(`${requestId} ${request.method} ${routeLabel} ${response.statusCode} ${Date.now() - started}ms`);
    });
    next();
  });
  app.setGlobalPrefix('api');
  const webOrigin = process.env.WEB_ORIGIN;
  if (webOrigin) app.enableCors({ origin: webOrigin, credentials: true });
  await app.listen(Number(process.env.PORT ?? 4000), '127.0.0.1');
}

void bootstrap();
