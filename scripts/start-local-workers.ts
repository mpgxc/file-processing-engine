import 'reflect-metadata';
import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import type { Context, SQSEvent, SQSRecord } from 'aws-lambda';
import { createWorkerHandler } from '../src/workers/core/worker-handler.factory';
import { applyLocalConfig } from '../src/core/config/local.config';

if (process.env['LOCAL'] === 'true') {
  applyLocalConfig();
}

const region = process.env['AWS_REGION'] ?? 'us-east-1';
const endpoint =
  process.env['AWS_SQS_ENDPOINT'] ?? process.env['AWS_ENDPOINT_URL'];

const sqs = new SQSClient(endpoint ? { endpoint, region } : { region });

const queueMap: Record<string, string | undefined> = {
  pdf: process.env['SQS_PDF_QUEUE_URL'],
  csv: process.env['SQS_CSV_QUEUE_URL'],
  xlsx: process.env['SQS_XLSX_QUEUE_URL'],
  txt: process.env['SQS_TXT_QUEUE_URL'],
};

const workerContext: Context = {
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'local-worker',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:local:000000000000:function:local-worker',
  memoryLimitInMB: '512',
  awsRequestId: 'local-request',
  logGroupName: '/aws/lambda/local-worker',
  logStreamName: 'local-stream',
  getRemainingTimeInMillis: () => 60_000,
  done: () => undefined,
  fail: () => undefined,
  succeed: () => undefined,
};

async function consume(format: string, queueUrl: string): Promise<void> {
  const handler = createWorkerHandler();
  console.log(`[worker:${format}] listening on ${queueUrl}`);

  while (true) {
    try {
      const response = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
          VisibilityTimeout: 30,
        }),
      );

      const messages = response.Messages ?? [];
      if (messages.length === 0) continue;

      const event: SQSEvent = {
        Records: messages.map(
          (message): SQSRecord => ({
            messageId: message.MessageId ?? '',
            receiptHandle: message.ReceiptHandle ?? '',
            body: message.Body ?? '',
            attributes: message.Attributes ?? {},
            messageAttributes: {},
            md5OfBody: message.MD5OfBody ?? '',
            eventSource: 'aws:sqs',
            eventSourceARN: '',
            awsRegion: region,
          }),
        ),
      };

      await handler(event, workerContext, () => undefined);

      for (const message of messages) {
        if (!message.ReceiptHandle) continue;
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
      }
    } catch (error) {
      console.error(`[worker:${format}] processing error`, error);
    }
  }
}

async function bootstrap(): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const [format, queueUrl] of Object.entries(queueMap)) {
    if (!queueUrl) continue;
    tasks.push(consume(format, queueUrl));
  }

  if (tasks.length === 0) {
    throw new Error('No queue URLs configured for local workers');
  }

  await Promise.all(tasks);
}

bootstrap().catch((error) => {
  console.error('Failed to start local workers', error);
  process.exit(1);
});
