import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface HandlerStackProps extends cdk.StackProps {
  jobsTable: dynamodb.Table;
  templatesTable: dynamodb.Table;
  queues: Record<string, sqs.Queue>;
  outputBucket: s3.Bucket;
  vpc: ec2.IVpc;
  /** Optional: AWS Secrets Manager ARN containing JWT_SECRET, SES_FROM_ADDRESS, etc. */
  secretsManagerArn?: string;
}

const SERVICE_NAME = 'report-service-api';
const CLUSTER_NAME = 'report-service';

export class HandlerStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly ecrRepo: ecr.Repository;
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: HandlerStackProps) {
    super(scope, id, props);

    // ECR repository — used by CI/CD to push the API image before first deploy
    this.ecrRepo = new ecr.Repository(this, 'ApiRepository', {
      repositoryName: SERVICE_NAME,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 10, description: 'Keep last 10 images' }],
    });

    // ECS Cluster (Fargate, no EC2)
    const cluster = new ecs.Cluster(this, 'ApiCluster', {
      clusterName: CLUSTER_NAME,
      vpc: props.vpc,
      containerInsights: true,
    });

    const logGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/ecs/${SERVICE_NAME}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    const taskDef = new ecs.FargateTaskDefinition(this, 'ApiTaskDef', {
      family: `${SERVICE_NAME}-task`,
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole,
      taskRole,
    });

    taskDef.addContainer('ApiContainer', {
      containerName: 'api',
      image: ecs.ContainerImage.fromEcrRepository(this.ecrRepo, 'latest'),
      portMappings: [{ containerPort: 3000, protocol: ecs.Protocol.TCP }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'api', logGroup }),
      environment: {
        NODE_ENV: 'production',
        PORT: '3000',
        LOG_LEVEL: 'INFO',
        JOBS_TABLE_NAME: props.jobsTable.tableName,
        TEMPLATES_TABLE_NAME: props.templatesTable.tableName,
        OUTPUT_BUCKET_NAME: props.outputBucket.bucketName,
        SQS_PDF_QUEUE_URL: props.queues['pdf']?.queueUrl ?? '',
        SQS_CSV_QUEUE_URL: props.queues['csv']?.queueUrl ?? '',
        SQS_XLSX_QUEUE_URL: props.queues['xlsx']?.queueUrl ?? '',
        SQS_TXT_QUEUE_URL: props.queues['txt']?.queueUrl ?? '',
        AWS_REGION: this.region,
      },
      // No container-level HEALTHCHECK — ALB target group health-check at /health is the source of truth.
      // Container HEALTHCHECK with curl/wget would require installing those into Alpine.
    });

    // Wire JWT_SECRET / SES_FROM_ADDRESS via Secrets Manager when ARN is provided.
    // Update Secrets Manager secret keys to match: jwtSecret, sesFromAddress
    if (props.secretsManagerArn) {
      const secret = cdk.aws_secretsmanager.Secret.fromSecretCompleteArn(
        this,
        'AppSecrets',
        props.secretsManagerArn,
      );
      const container = taskDef.findContainer('api');
      container?.addSecret('JWT_SECRET', ecs.Secret.fromSecretsManager(secret, 'jwtSecret'));
      container?.addSecret('SES_FROM_ADDRESS', ecs.Secret.fromSecretsManager(secret, 'sesFromAddress'));
    }

    // Two security groups: ALB SG (only the consumer can hit the LB)
    // and Service SG (only the ALB SG can hit container port 3000).
    const sgAlb = new ec2.SecurityGroup(this, 'SgAlb', {
      vpc: props.vpc,
      description: 'Internal ALB SG — accepts inbound from VPC consumers',
      allowAllOutbound: true,
    });

    const sgService = new ec2.SecurityGroup(this, 'SgService', {
      vpc: props.vpc,
      description: 'ECS API task SG — accepts inbound from ALB only',
      allowAllOutbound: true,
    });
    sgService.addIngressRule(sgAlb, ec2.Port.tcp(3000), 'ALB to container');

    this.alb = new elbv2.ApplicationLoadBalancer(this, 'ApiALB', {
      vpc: props.vpc,
      internetFacing: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroup: sgAlb,
    });

    const listener = this.alb.addListener('HttpListener', { port: 80, open: false });

    this.service = new ecs.FargateService(this, 'ApiService', {
      serviceName: SERVICE_NAME,
      cluster,
      taskDefinition: taskDef,
      desiredCount: 2,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [sgService],
      assignPublicIp: false,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      circuitBreaker: { rollback: true },
    });

    // Single target group attached to listener — referenced for both routing and scaling.
    const apiTarget = listener.addTargets('ApiTarget', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.service],
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
        healthyHttpCodes: '200',
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // Auto-scaling — uses the same target group (no duplicate registration).
    const scaling = this.service.autoScaleTaskCount({ minCapacity: 2, maxCapacity: 10 });
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(30),
    });
    scaling.scaleOnRequestCount('RequestScaling', {
      requestsPerTarget: 1000,
      targetGroup: apiTarget,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(30),
    });

    // IAM grants on task role
    props.jobsTable.grantReadWriteData(taskRole);
    props.templatesTable.grantReadData(taskRole);
    props.outputBucket.grantRead(taskRole);
    Object.values(props.queues).forEach((q) => q.grantSendMessages(taskRole));

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      description: 'Internal ALB DNS — base URL for in-VPC API consumers',
    });

    new cdk.CfnOutput(this, 'EcrRepoUri', {
      value: this.ecrRepo.repositoryUri,
      description: 'ECR repo URI for CI/CD docker push',
    });

    new cdk.CfnOutput(this, 'EcsServiceName', {
      value: this.service.serviceName,
      description: 'ECS service name (stable, used by CI/CD)',
    });

    new cdk.CfnOutput(this, 'EcsClusterName', {
      value: cluster.clusterName,
      description: 'ECS cluster name',
    });
  }
}
