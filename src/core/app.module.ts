import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from './config/config.module.js';
import { EnginesModule } from '../engines/engines.module.js';
import { MailModule } from '../mail/mail.module.js';
import { ReportingModule } from '../features/reporting/reporting.module.js';
import { HealthModule } from '../features/health/health.module.js';
import { AppExceptionFilter } from './filters/app-exception.filter.js';
import { JwtMiddleware } from './auth/jwt.middleware.js';

@Module({
  imports: [
    ConfigModule,
    EnginesModule,
    MailModule,
    ReportingModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    JwtMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(JwtMiddleware)
      .forRoutes({ path: 'reports/*path', method: RequestMethod.ALL });
  }
}
