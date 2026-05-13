import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ReportFormat } from '../types/job.types.js';
import { ReportJobMessage } from '../types/sqs.types.js';

let sqsClient: SQSClient | null = null;

function getSqsClient(): SQSClient {
  if (sqsClient) return sqsClient;
  sqsClient = new SQSClient({});
  return sqsClient;
}

export function resolveQueueUrl(format: ReportFormat): string {
  const map: Record<ReportFormat, string | undefined> = {
    [ReportFormat.PDF]: process.env['SQS_PDF_QUEUE_URL'],
    [ReportFormat.CSV]: process.env['SQS_CSV_QUEUE_URL'],
    [ReportFormat.XLSX]: process.env['SQS_XLSX_QUEUE_URL'],
    [ReportFormat.TXT]: process.env['SQS_TXT_QUEUE_URL'],
  };
  const url = map[format];
  if (!url)
    throw new Error(`SQS queue URL not configured for format ${format}`);
  return url;
}

export class SqsPublisher {
  private readonly client = getSqsClient();

  async publishJob(
    queueUrl: string,
    message: ReportJobMessage,
  ): Promise<{ messageId: string }> {
    const result = await this.client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        MessageGroupId: message.dedupHash,
        MessageDeduplicationId: message.dedupHash,
      }),
    );
    return { messageId: result.MessageId ?? '' };
  }
}
