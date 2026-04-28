import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CoreStack } from '../lib/core-stack';
import { StorageStack } from '../lib/storage-stack';
import { HandlerStack } from '../lib/handler-stack';
import { WorkersStack } from '../lib/workers-stack';
import { ObservabilityStack } from '../lib/observability-stack';

const app = new cdk.App();

const env = {
  account: process.env['CDK_ACCOUNT'] ?? process.env['CDK_DEFAULT_ACCOUNT'],
  region: process.env['CDK_REGION'] ?? process.env['CDK_DEFAULT_REGION'] ?? 'us-east-1',
};

const core = new CoreStack(app, 'ReportServiceCore', { env });

const storage = new StorageStack(app, 'ReportServiceStorage', {
  env,
  vpc: core.vpc,
  sgEfs: core.sgEfs,
  sgLambda: core.sgLambda,
});

const handler = new HandlerStack(app, 'ReportServiceHandler', {
  env,
  jobsTable: core.jobsTable,
  templatesTable: core.templatesTable,
  queues: core.queues,
  outputBucket: storage.outputBucket,
  vpc: core.vpc,
  // secretsManagerArn: process.env['JWT_SECRETS_ARN'], // wire when secret exists
});

new WorkersStack(app, 'ReportServiceWorkers', {
  env,
  jobsTable: core.jobsTable,
  templatesTable: core.templatesTable,
  queues: core.queues,
  templateBucket: storage.templateBucket,
  outputBucket: storage.outputBucket,
  vpc: core.vpc,
  sgLambda: core.sgLambda,
  templateAP: storage.templateAP,
  outputAP: storage.outputAP,
});

new ObservabilityStack(app, 'ReportServiceObservability', {
  env,
  alertsTopic: core.alertsTopic,
  apiAlb: handler.alb,
  ecsClusterName: 'report-service',
  ecsServiceName: 'report-service-api',
});
