import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

interface StorageStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  sgEfs: ec2.SecurityGroup;
  sgLambda: ec2.SecurityGroup;
}

export class StorageStack extends cdk.Stack {
  public readonly templateBucket: s3.Bucket;
  public readonly outputBucket: s3.Bucket;
  public readonly templateAP: efs.AccessPoint;
  public readonly outputAP: efs.AccessPoint;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    // VPC Endpoints — Gateway (free)
    props.vpc.addGatewayEndpoint('S3Endpoint', { service: ec2.GatewayVpcEndpointAwsService.S3 });
    props.vpc.addGatewayEndpoint('DynamoDbEndpoint', { service: ec2.GatewayVpcEndpointAwsService.DYNAMODB });

    // VPC Endpoints — Interface
    props.vpc.addInterfaceEndpoint('SqsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SQS,
      securityGroups: [props.sgLambda],
      privateDnsEnabled: true,
    });

    props.vpc.addInterfaceEndpoint('SesEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SES,
      securityGroups: [props.sgLambda],
      privateDnsEnabled: true,
    });

    // S3 Buckets
    this.templateBucket = new s3.Bucket(this, 'TemplateBucket', {
      bucketName: `report-service-templates-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.outputBucket = new s3.Bucket(this, 'OutputBucket', {
      bucketName: `report-service-outputs-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          transitions: [
            { storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: cdk.Duration.days(30) },
            { storageClass: s3.StorageClass.GLACIER, transitionAfter: cdk.Duration.days(90) },
          ],
          expiration: cdk.Duration.days(365),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // EFS FileSystem for templates (read-only mount)
    const templateFs = new efs.FileSystem(this, 'TemplateFsystem', {
      vpc: props.vpc,
      securityGroup: props.sgEfs,
      encrypted: true,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_30_DAYS,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.templateAP = templateFs.addAccessPoint('TemplateAP', {
      path: '/templates',
      posixUser: { uid: '1000', gid: '1000' },
      createAcl: { ownerUid: '1000', ownerGid: '1000', permissions: '755' },
    });

    // EFS FileSystem for outputs (read-write mount)
    const outputFs = new efs.FileSystem(this, 'OutputFsystem', {
      vpc: props.vpc,
      securityGroup: props.sgEfs,
      encrypted: true,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_30_DAYS,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.outputAP = outputFs.addAccessPoint('OutputAP', {
      path: '/outputs',
      posixUser: { uid: '1000', gid: '1000' },
      createAcl: { ownerUid: '1000', ownerGid: '1000', permissions: '755' },
    });
  }
}
