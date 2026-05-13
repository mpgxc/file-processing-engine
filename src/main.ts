import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './core/app.module.js';
import { applyLocalConfig } from './core/config/local.config.js';

if (process.env['LOCAL'] === 'true') {
  applyLocalConfig();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env['PORT'] ?? 3000);
}

bootstrap().catch(console.error);
