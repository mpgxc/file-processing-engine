import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ReportFormat, JobStatus } from '../src/shared/types/job.types.js';

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ endpoint: 'http://localhost:4566', region: 'us-east-1' }),
  { marshallOptions: { removeUndefinedValues: true } },
);

async function seed() {
  await client.send(new PutCommand({
    TableName: 'report_templates',
    Item: {
      templateId: 'financial-report',
      version: 'v1',
      format: ReportFormat.PDF,
      name: 'Financial Report',
      s3Key: 'pdf/financial-report/v1.hbs',
      mailTemplateId: 'report-ready',
      tenantId: 'global',
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  }));

  await client.send(new PutCommand({
    TableName: 'report_templates',
    Item: {
      templateId: 'transactions',
      version: 'v1',
      format: ReportFormat.CSV,
      name: 'Transactions CSV',
      s3Key: 'csv/transactions/v1.json',
      mailTemplateId: 'report-ready',
      tenantId: 'global',
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  }));

  console.log('Seeded 2 templates successfully');
}

seed().catch(console.error);
