import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-lambda-event-sources';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface WorkerConfig {
  memorySize: number;
  timeoutSeconds: number;
  maxConcurrency: number;
}

const WORKER_CONFIGS: Record<string, WorkerConfig> = {
  pdf:  { memorySize: 1536, timeoutSeconds: 300, maxConcurrency: 5 },
  csv:  { memorySize: 512,  timeoutSeconds: 180, maxConcurrency: 10 },
  xlsx: { memorySize: 1024, timeoutSeconds: 180, maxConcurrency: 8 },
  txt:  { memorySize: 256,  timeoutSeconds: 30,  maxConcurrency: 20 },
};

interface WorkersStackProps extends cdk.StackProps {
  jobsTable: dynamodb.Table;
  templatesTable: dynamodb.Table;
  queues: Record<string, sqs.Queue>;
  templateBucket: s3.Bucket;
  outputBucket: s3.Bucket;
  vpc: ec2.IVpc;
  sgLambda: ec2.SecurityGroup;
  templateAP: efs.AccessPoint;
  outputAP: efs.AccessPoint;
}

export class WorkersStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WorkersStackProps) {
    super(scope, id, props);

    const baseEnv: Record<string, string> = {
      JOBS_TABLE_NAME: props.jobsTable.tableName,
      TEMPLATES_TABLE_NAME: props.templatesTable.tableName,
      OUTPUT_BUCKET_NAME: props.outputBucket.bucketName,
      TEMPLATES_MOUNT_PATH: '/mnt/templates',
      OUTPUTS_MOUNT_PATH: '/mnt/outputs',
      SES_FROM_ADDRESS: process.env['SES_FROM_ADDRESS'] ?? 'noreply@example.com',
      LOG_LEVEL: 'INFO',
      NODE_ENV: 'production',
      POWERTOOLS_SERVICE_NAME: 'report-service',
      POWERTOOLS_METRICS_NAMESPACE: 'ReportService',
    };

    for (const [fmt, config] of Object.entries(WORKER_CONFIGS)) {
      const queue = props.queues[fmt];
      if (!queue) continue;

      const workerFn = new lambda.Function(this, `${fmt.toUpperCase()}WorkerFunction`, {
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        handler: `${fmt}-worker.handler`,
        code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'dist', 'workers')),
        memorySize: config.memorySize,
        timeout: cdk.Duration.seconds(config.timeoutSeconds),
        vpc: props.vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [props.sgLambda],
        environment: baseEnv,
      });

      // EFS mounts via Access Points
      workerFn.addFileSystem(
        lambda.FileSystem.fromEfsAccessPoint(props.templateAP, '/mnt/templates'),
      );
      workerFn.addFileSystem(
        lambda.FileSystem.fromEfsAccessPoint(props.outputAP, '/mnt/outputs'),
      );

      // IAM: EFS client permissions
      workerFn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'elasticfilesystem:ClientMount',
            'elasticfilesystem:ClientWrite',
            'elasticfilesystem:ClientRootAccess',
          ],
          resources: [props.templateAP.accessPointArn, props.outputAP.accessPointArn],
        }),
      );

      workerFn.addEventSource(
        new events.SqsEventSource(queue, {
          batchSize: 1,
          maxConcurrency: config.maxConcurrency,
          reportBatchItemFailures: false,
        }),
      );

      props.jobsTable.grantReadWriteData(workerFn);
      props.templatesTable.grantReadData(workerFn);
      props.templateBucket.grantRead(workerFn);
      props.outputBucket.grantReadWrite(workerFn);
      queue.grantConsumeMessages(workerFn);
    }
  }
}
