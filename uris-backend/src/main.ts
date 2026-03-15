import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Strict DTO validation — strip unknown fields, reject bad payloads
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — restrict to configured origins only
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'https://uris-nu.vercel.app/')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Dataset-Id',
      'X-Run-Id',
      'X-Backend-Url',
    ],
    credentials: true,
  });

  const port = process.env.PORT ?? 5000;
  await app.listen(port);
  console.log(`🚀 URIS backend running on http://localhost:${port}`);
}

bootstrap();