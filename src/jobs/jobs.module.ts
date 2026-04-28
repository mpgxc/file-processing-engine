import { Module } from '@nestjs/common';
import { DynamoDbJobRepository } from '../shared/repositories/job.repository.js';

@Module({
  providers: [{ provide: 'JOB_REPOSITORY', useClass: DynamoDbJobRepository }],
  exports: ['JOB_REPOSITORY'],
})
export class JobsModule {}
