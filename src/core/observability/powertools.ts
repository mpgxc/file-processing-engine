import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';

export const logger = new Logger({
  serviceName: 'report-service',
  logLevel:
    (process.env['LOG_LEVEL'] as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR') ?? 'INFO',
});

export const tracer = new Tracer({ serviceName: 'report-service' });

export const metrics = new Metrics({
  namespace: 'ReportService',
  serviceName: 'report-service',
});

export { MetricUnit };
