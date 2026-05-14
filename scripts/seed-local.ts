import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ReportFormat } from '../src/commons/types/job.types.js';

const endpoint =
  process.env['AWS_DYNAMODB_ENDPOINT'] ??
  process.env['AWS_ENDPOINT_URL'] ??
  'http://localhost:4566';
const region = process.env['AWS_REGION'] ?? 'us-east-1';
const templatesTableName = process.env['TEMPLATES_TABLE_NAME'] ?? 'report_templates';
const jobsTableName = process.env['JOBS_TABLE_NAME'] ?? 'report_jobs';
const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 3600;

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ endpoint, region }),
  { marshallOptions: { removeUndefinedValues: true } },
);

async function seed() {
  await client.send(new PutCommand({
    TableName: templatesTableName,
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
    TableName: templatesTableName,
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

  const now = new Date().toISOString();
  await client.send(new PutCommand({
    TableName: jobsTableName,
    Item: {
      jobId: '01JLOCALPENDINGJOB0000000001',
      tenantId: 'global',
      userId: 'local-user',
      format: ReportFormat.PDF,
      templateId: 'financial-report',
      templateVersion: 'v1',
      params: { reportTitle: 'Local pending job' },
      paramsHash: 'local-params-hash',
      dedupHash: 'local-dedup-hash',
      status: 'PENDING',
      recipientEmail: 'user@dev.local',
      recipientName: 'Local User',
      locale: 'pt-BR',
      createdAt: now,
      updatedAt: now,
      expiresAt: Math.floor(Date.now() / 1000) + THIRTY_DAYS_IN_SECONDS,
    },
  }));

  console.log('Seeded 2 templates and 1 pending job successfully');
}

seed().catch(console.error);
