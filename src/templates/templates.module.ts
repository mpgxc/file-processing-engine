import { Module } from '@nestjs/common';
import { DynamoDbTemplateRepository } from '../shared/repositories/template.repository.js';

@Module({
  providers: [
    { provide: 'TEMPLATE_REPOSITORY', useClass: DynamoDbTemplateRepository },
  ],
  exports: ['TEMPLATE_REPOSITORY'],
})
export class TemplatesModule {}
