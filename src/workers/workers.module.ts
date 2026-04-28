import { Module } from '@nestjs/common';
import { BaseWorker } from './base-worker.js';
import { EnginesModule } from '../engines/engines.module.js';
import { MailModule } from '../mail/mail.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { TemplatesModule } from '../templates/templates.module.js';

@Module({
  imports: [EnginesModule, MailModule, JobsModule, TemplatesModule],
  providers: [BaseWorker],
  exports: [BaseWorker],
})
export class WorkersModule {}
