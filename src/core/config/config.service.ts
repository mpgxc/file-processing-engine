import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const configSchema = z
  .object({
    jobsTableName: z.string().min(1),
    templatesTableName: z.string().min(1),
    outputBucketName: z.string().min(1),
    jwtSecret: z.string().optional(),
    jwtJwksUri: z.string().url().optional(),
    sqsPdfQueueUrl: z.string().url(),
    sqsCsvQueueUrl: z.string().url(),
    sqsXlsxQueueUrl: z.string().url(),
    sqsTxtQueueUrl: z.string().url(),
    awsRegion: z.string().default('us-east-1'),
    logLevel: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO'),
    sesFromAddress: z.string().email(),
    templatesMountPath: z.string().default('/mnt/templates'),
    outputsMountPath: z.string().default('/mnt/outputs'),
  })
  .refine((c) => c.jwtSecret || c.jwtJwksUri, {
    message: 'Either JWT_SECRET or JWT_JWKS_URI must be provided',
    path: ['jwtSecret'],
  });

export type AppConfig = z.infer<typeof configSchema>;

@Injectable()
export class ConfigService {
  private readonly config: AppConfig;

  constructor() {
    const result = configSchema.safeParse({
      jobsTableName: process.env['JOBS_TABLE_NAME'],
      templatesTableName: process.env['TEMPLATES_TABLE_NAME'],
      outputBucketName: process.env['OUTPUT_BUCKET_NAME'],
      jwtSecret: process.env['JWT_SECRET'],
      jwtJwksUri: process.env['JWT_JWKS_URI'],
      sqsPdfQueueUrl: process.env['SQS_PDF_QUEUE_URL'],
      sqsCsvQueueUrl: process.env['SQS_CSV_QUEUE_URL'],
      sqsXlsxQueueUrl: process.env['SQS_XLSX_QUEUE_URL'],
      sqsTxtQueueUrl: process.env['SQS_TXT_QUEUE_URL'],
      awsRegion: process.env['AWS_REGION'],
      logLevel: process.env['LOG_LEVEL'],
      sesFromAddress: process.env['SES_FROM_ADDRESS'],
      templatesMountPath: process.env['TEMPLATES_MOUNT_PATH'],
      outputsMountPath: process.env['OUTPUTS_MOUNT_PATH'],
    });

    if (!result.success) {
      throw new Error(
        `Invalid configuration: ${JSON.stringify(result.error.format())}`,
      );
    }
    this.config = result.data;
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  getAll(): Readonly<AppConfig> {
    return this.config;
  }
}
