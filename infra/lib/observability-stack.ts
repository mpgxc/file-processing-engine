import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

interface ObservabilityStackProps extends cdk.StackProps {
  alertsTopic: sns.Topic;
  /** Optional: ALB to monitor for 5xx errors (HandlerStack.alb) */
  apiAlb?: elbv2.IApplicationLoadBalancer;
  /** Optional: ECS cluster + service names for CPU alarm */
  ecsClusterName?: string;
  ecsServiceName?: string;
}

const WORKER_FORMATS = ['PDF', 'CSV', 'XLSX', 'TXT'] as const;

export class ObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const action = new cwActions.SnsAction(props.alertsTopic);

    // ── Worker Lambda error-rate alarms ───────────────────────────────────
    for (const fmt of WORKER_FORMATS) {
      const fnName = `report-service-${fmt.toLowerCase()}-worker`;
      const errorRate = new cloudwatch.MathExpression({
        expression: '(errors / invocations) * 100',
        usingMetrics: {
          errors: new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Errors',
            dimensionsMap: { FunctionName: fnName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          invocations: new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Invocations',
            dimensionsMap: { FunctionName: fnName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        },
        period: cdk.Duration.minutes(5),
      });

      new cloudwatch.Alarm(this, `${fmt}WorkerErrorRateAlarm`, {
        alarmName: `report-${fmt.toLowerCase()}-worker-error-rate`,
        alarmDescription: `Worker Lambda error rate > 1% for ${fmt}`,
        metric: errorRate,
        threshold: 1,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(action);
    }

    // ── API (ECS Fargate) alarms ──────────────────────────────────────────
    // The API runs on ECS, so we alarm on ALB 5xx and ECS task health, not on Lambda metrics.
    if (props.apiAlb) {
      const albFullName = props.apiAlb.loadBalancerFullName;

      // Alarm: ALB target 5xx > 1% of total requests over 5 min (any 5xx is bad).
      const target5xxRate = new cloudwatch.MathExpression({
        expression: '(errors5xx / requests) * 100',
        usingMetrics: {
          errors5xx: new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'HTTPCode_Target_5XX_Count',
            dimensionsMap: { LoadBalancer: albFullName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          requests: new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'RequestCount',
            dimensionsMap: { LoadBalancer: albFullName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        },
        period: cdk.Duration.minutes(5),
      });

      new cloudwatch.Alarm(this, 'ApiAlbTarget5xxAlarm', {
        alarmName: 'report-api-target-5xx-rate',
        alarmDescription: 'API ECS target 5xx rate > 1%',
        metric: target5xxRate,
        threshold: 1,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(action);

      // Alarm: ALB 5xx (load balancer-level — service is hard-down)
      new cloudwatch.Alarm(this, 'ApiAlbLb5xxAlarm', {
        alarmName: 'report-api-lb-5xx',
        alarmDescription: 'ALB-level 5xx (no healthy targets / LB error)',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ApplicationELB',
          metricName: 'HTTPCode_ELB_5XX_Count',
          dimensionsMap: { LoadBalancer: albFullName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
        }),
        threshold: 5,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(action);
    }

    if (props.ecsClusterName && props.ecsServiceName) {
      // Alarm: ECS service CPU > 85% sustained
      new cloudwatch.Alarm(this, 'ApiEcsHighCpuAlarm', {
        alarmName: 'report-api-ecs-high-cpu',
        alarmDescription: 'API ECS task CPU > 85% sustained',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ECS',
          metricName: 'CPUUtilization',
          dimensionsMap: {
            ClusterName: props.ecsClusterName,
            ServiceName: props.ecsServiceName,
          },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 85,
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(action);
    }
  }
}
