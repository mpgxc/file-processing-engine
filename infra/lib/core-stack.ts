import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export class CoreStack extends cdk.Stack {
  public readonly jobsTable: dynamodb.Table;
  public readonly templatesTable: dynamodb.Table;
  public readonly queues: Record<string, sqs.Queue>;
  public readonly dlqs: Record<string, sqs.Queue>;
  public readonly vpc: ec2.IVpc;
  public readonly sgLambda: ec2.SecurityGroup;
  public readonly sgEfs: ec2.SecurityGroup;
  public readonly alertsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC: lookup existing or create new
    const vpcId = process.env['CDK_VPC_ID'];
    if (vpcId) {
      this.vpc = ec2.Vpc.fromLookup(this, 'Vpc', { vpcId });
    } else {
      this.vpc = new ec2.Vpc(this, 'Vpc', {
        maxAzs: 2,
        natGateways: 0,
        subnetConfiguration: [
          { name: 'private', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
        ],
      });
    }

    // Security Groups
    this.sgLambda = new ec2.SecurityGroup(this, 'SgLambda', {
      vpc: this.vpc,
      description: 'Lambda functions SG — outbound only',
      allowAllOutbound: true,
    });

    this.sgEfs = new ec2.SecurityGroup(this, 'SgEfs', {
      vpc: this.vpc,
      description: 'EFS/S3 Files mount targets SG',
      allowAllOutbound: false,
    });
    this.sgEfs.addIngressRule(this.sgLambda, ec2.Port.tcp(2049), 'NFS from Lambda');

    // SNS Alerts Topic
    this.alertsTopic = new sns.Topic(this, 'AlertsTopic', {
      topicName: 'report-service-alerts',
      displayName: 'Report Service Alerts',
    });

    // DynamoDB Tables
    this.jobsTable = new dynamodb.Table(this, 'JobsTable', {
      tableName: 'report_jobs',
      partitionKey: { name: 'jobId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.jobsTable.addGlobalSecondaryIndex({
      indexName: 'dedupHash-index',
      partitionKey: { name: 'dedupHash', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.templatesTable = new dynamodb.Table(this, 'TemplatesTable', {
      tableName: 'report_templates',
      partitionKey: { name: 'templateId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'version', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.templatesTable.addGlobalSecondaryIndex({
      indexName: 'tenantId-format-index',
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'format', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // SQS Queues + DLQs + CloudWatch Alarms
    const formats = ['pdf', 'csv', 'xlsx', 'txt'] as const;
    const visibilityMap: Record<string, number> = { pdf: 360, csv: 120, xlsx: 180, txt: 60 };

    this.queues = {};
    this.dlqs = {};

    for (const fmt of formats) {
      const dlq = new sqs.Queue(this, `${fmt.toUpperCase()}DLQ`, {
        queueName: `report-${fmt}-dlq`,
        retentionPeriod: cdk.Duration.days(14),
        encryption: sqs.QueueEncryption.KMS_MANAGED,
      });

      const queue = new sqs.Queue(this, `${fmt.toUpperCase()}Queue`, {
        queueName: `report-${fmt}-queue`,
        visibilityTimeout: cdk.Duration.seconds(visibilityMap[fmt] ?? 60),
        deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
        encryption: sqs.QueueEncryption.KMS_MANAGED,
      });

      this.queues[fmt] = queue;
      this.dlqs[fmt] = dlq;

      // Alarm: DLQ depth > 0
      const alarm = new cloudwatch.Alarm(this, `${fmt.toUpperCase()}DlqAlarm`, {
        alarmName: `report-${fmt}-dlq-depth`,
        alarmDescription: `Messages in report-${fmt}-dlq DLQ`,
        metric: dlq.metricApproximateNumberOfMessagesVisible({ period: cdk.Duration.minutes(1) }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(new cwActions.SnsAction(this.alertsTopic));
    }
  }
}
