import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './core/app.module';
import { applyLocalConfig } from './core/config/local.config';

if (process.env['LOCAL'] === 'true') {
  applyLocalConfig();
}

(async () => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  if (process.env['LOCAL'] === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Report Service API')
      .setDescription('Report generation — PDF, CSV, XLSX, TXT')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
})();
