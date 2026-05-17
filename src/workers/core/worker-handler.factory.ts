import { NestFactory } from '@nestjs/core';
import type { SQSEvent, SQSHandler, Context } from 'aws-lambda';
import { Module } from '@nestjs/common';
import { ConfigModule } from '../../core/config/config.module';
import { EnginesModule } from '../../engines/engines.module';
import { MailModule } from '../../mail/mail.module';
import { ReportingModule } from '../../features/reporting/reporting.module';
import { BaseWorker } from './base.worker';
import {
  logger,
  tracer,
  metrics,
  MetricUnit,
} from '../../core/observability/powertools';

@Module({
  imports: [ConfigModule, EnginesModule, MailModule, ReportingModule],
  providers: [BaseWorker],
})
class WorkerAppModule {}

let cachedWorker: BaseWorker | null = null;

async function getWorker(): Promise<BaseWorker> {
  if (cachedWorker) return cachedWorker;
  logger.info('Cold start — bootstrapping worker NestJS context');
  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    logger: false,
  });
  cachedWorker = app.get(BaseWorker);
  return cachedWorker!;
}

export function createWorkerHandler(): SQSHandler {
  return async (event: SQSEvent, context: Context) => {
    logger.addContext(context);
    logger.info('SQS batch received', { recordCount: event.Records.length });

    const segment = tracer.getSegment();
    const subsegment = segment?.addNewSubsegment('## worker');

    const worker = await getWorker();

    const results = await Promise.allSettled(
      event.Records.map((record) => {
        logger.appendKeys({ messageId: record.messageId });
        return worker.processRecord(record);
      }),
    );

    const failed = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    const succeeded = results.length - failed.length;

    metrics.addMetric('sqsRecordsProcessed', MetricUnit.Count, succeeded);

    if (failed.length > 0) {
      metrics.addMetric('sqsRecordsFailed', MetricUnit.Count, failed.length);
      const reasons = failed.map((f) => String(f.reason)).join('; ');
      logger.error('Worker records failed', {
        failedCount: failed.length,
        reasons,
      });
      subsegment?.addErrorFlag();
      subsegment?.close();
      metrics.publishStoredMetrics();
      throw new Error(`${failed.length} record(s) failed: ${reasons}`);
    }

    logger.info('All records processed successfully', { count: succeeded });
    subsegment?.close();
    metrics.publishStoredMetrics();
  };
}
