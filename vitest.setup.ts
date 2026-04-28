import { vi } from 'vitest';

vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: vi.fn() }));
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: vi.fn() })) },
  PutCommand: vi.fn(),
  GetCommand: vi.fn(),
  QueryCommand: vi.fn(),
  UpdateCommand: vi.fn(),
}));
vi.mock('@aws-sdk/client-sqs', () => ({ SQSClient: vi.fn(), SendMessageCommand: vi.fn() }));
vi.mock('@aws-sdk/client-s3', () => ({ S3Client: vi.fn(), GetObjectCommand: vi.fn() }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn().mockResolvedValue('https://presigned.url/file') }));
vi.mock('@aws-sdk/client-ses', () => ({ SESClient: vi.fn(), SendEmailCommand: vi.fn() }));

process.env['JOBS_TABLE_NAME'] = 'report_jobs_test';
process.env['TEMPLATES_TABLE_NAME'] = 'report_templates_test';
process.env['OUTPUT_BUCKET_NAME'] = 'test-bucket';
process.env['SQS_PDF_QUEUE_URL'] = 'https://sqs.us-east-1.amazonaws.com/000/pdf-queue';
process.env['SQS_CSV_QUEUE_URL'] = 'https://sqs.us-east-1.amazonaws.com/000/csv-queue';
process.env['SQS_XLSX_QUEUE_URL'] = 'https://sqs.us-east-1.amazonaws.com/000/xlsx-queue';
process.env['SQS_TXT_QUEUE_URL'] = 'https://sqs.us-east-1.amazonaws.com/000/txt-queue';
process.env['JWT_SECRET'] = 'test-secret';
process.env['SES_FROM_ADDRESS'] = 'test@example.com';
process.env['AWS_REGION'] = 'us-east-1';
process.env['TEMPLATES_MOUNT_PATH'] = './fixtures/templates';
process.env['OUTPUTS_MOUNT_PATH'] = './fixtures/outputs';
