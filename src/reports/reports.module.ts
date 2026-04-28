import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { TemplatesModule } from '../templates/templates.module.js';

@Module({
  imports: [JobsModule, TemplatesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
