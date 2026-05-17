import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { EnginesModule } from '../engines/engines.module';
import { MailModule } from '../mail/mail.module';
import { ReportingModule } from '../features/reporting/reporting.module';
import { HealthModule } from '../features/health/health.module';
import { AppExceptionFilter } from './filters/app-exception.filter';
import { JwtMiddleware } from './auth/jwt.middleware';

@Module({
  imports: [
    ConfigModule,
    EnginesModule,
    MailModule,
    ReportingModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AppExceptionFilter,
    },
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
