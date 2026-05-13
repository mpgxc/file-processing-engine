import { Module } from '@nestjs/common';
import { ReportsController } from './reports/reports.controller.js';
import { ReportsService } from './reports/reports.service.js';
import { DynamoDbJobRepository } from './repositories/job.repository.js';
import { DynamoDbTemplateRepository } from './repositories/template.repository.js';
import { REPOSITORY_TOKENS } from './repositories/repository-tokens.js';

@Module({
  controllers: [ReportsController],
  providers: [
    ReportsService,
    { provide: REPOSITORY_TOKENS.JOB, useClass: DynamoDbJobRepository },
    {
      provide: REPOSITORY_TOKENS.TEMPLATE,
      useClass: DynamoDbTemplateRepository,
    },
  ],
  exports: [ReportsService, REPOSITORY_TOKENS.JOB, REPOSITORY_TOKENS.TEMPLATE],
})
export class ReportingModule {}
