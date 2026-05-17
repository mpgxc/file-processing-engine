import { Module } from '@nestjs/common';
import { BaseWorker } from './core/base.worker';
import { EnginesModule } from '../engines/engines.module';
import { MailModule } from '../mail/mail.module';
import { ReportingModule } from '../features/reporting/reporting.module';

@Module({
  imports: [EnginesModule, MailModule, ReportingModule],
  providers: [BaseWorker],
  exports: [BaseWorker],
})
export class WorkersModule {}
