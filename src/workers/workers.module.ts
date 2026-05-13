import { Module } from '@nestjs/common';
import { BaseWorker } from './core/base.worker.js';
import { EnginesModule } from '../engines/engines.module.js';
import { MailModule } from '../mail/mail.module.js';
import { ReportingModule } from '../features/reporting/reporting.module.js';

@Module({
  imports: [EnginesModule, MailModule, ReportingModule],
  providers: [BaseWorker],
  exports: [BaseWorker],
})
export class WorkersModule {}
