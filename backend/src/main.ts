import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { rootLogger } from './common/logger/logger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    // rawBody: webhook signature verification must run over the exact bytes
    // the provider signed — Nest keeps them on req.rawBody for us.
    { bufferLogs: false, rawBody: true },
  );

  // Plain-WebSocket gateway (ws://.../ws/availability) on the same server.
  app.useWebSocketAdapter(new WsAdapter(app));

  const config = app.get(AppConfigService);

  // Request context (trace id + actor) is bound by ContextGuard — the first
  // global guard — NOT a Fastify hook: `als.run(ctx, done)` in an onRequest
  // hook does not survive into route handlers on Fastify 5.

  app.enableShutdownHooks();

  await app.listen({ port: config.port, host: '0.0.0.0' });
  rootLogger.info({ port: config.port }, 'Last Chance backend is listening');
}

void bootstrap();
