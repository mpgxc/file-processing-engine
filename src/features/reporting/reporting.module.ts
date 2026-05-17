import { Module } from '@nestjs/common';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { DynamoDbJobRepository } from './repositories/job.repository';
import { DynamoDbTemplateRepository } from './repositories/template.repository';
import { REPOSITORY_TOKENS } from './repositories/repository-tokens';

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
