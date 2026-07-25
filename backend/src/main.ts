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
import {
  LocalDiskStorage,
  MEDIA_ROOT,
  MEDIA_URL_PREFIX,
} from './modules/media/infrastructure/local-disk.storage';
import { MAX_PHOTO_BYTES } from './modules/media/application/unit-photo.service';

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

  // Uploads: multipart parsing for the media endpoints, and static serving of
  // what they wrote. The size limit is enforced here as well as in the service
  // so an oversized body is refused while streaming, not after buffering it.
  await app.register(import('@fastify/multipart'), {
    limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
  });

  await LocalDiskStorage.ensureRoot();
  await app.register(import('@fastify/static'), {
    root: MEDIA_ROOT,
    prefix: `${MEDIA_URL_PREFIX}/`,
    // User-supplied bytes: never let the browser sniff a different type, and
    // never let one of these run as script in our origin.
    setHeaders(res: { setHeader: (k: string, v: string) => void }) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  });

  // Request context (trace id + actor) is bound by ContextGuard — the first
  // global guard — NOT a Fastify hook: `als.run(ctx, done)` in an onRequest
  // hook does not survive into route handlers on Fastify 5.

  app.enableShutdownHooks();

  await app.listen({ port: config.port, host: '0.0.0.0' });
  rootLogger.info({ port: config.port }, 'Last Chance backend is listening');
}

void bootstrap();
