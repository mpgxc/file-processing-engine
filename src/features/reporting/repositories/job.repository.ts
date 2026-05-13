import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { getDynamoDbClient } from '../../../commons/clients/dynamodb.client.js';
import { ReportJob, JobStatus } from '../../../commons/types/job.types.js';

export interface IJobRepository {
  create(job: ReportJob): Promise<void>;
  findById(jobId: string): Promise<ReportJob | null>;
  findByDedupHash(dedupHash: string): Promise<ReportJob | null>;
  updateStatus(
    jobId: string,
    status: JobStatus,
    extra?: Partial<ReportJob>,
  ): Promise<void>;
}

export class DynamoDbJobRepository implements IJobRepository {
  private readonly tableName = process.env['JOBS_TABLE_NAME'] ?? '';
  private readonly client = getDynamoDbClient();

  async create(job: ReportJob): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: job,
        ConditionExpression: 'attribute_not_exists(jobId)',
      }),
    );
  }

  async findById(jobId: string): Promise<ReportJob | null> {
    const result = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: { jobId } }),
    );
    return (result.Item as ReportJob | undefined) ?? null;
  }

  async findByDedupHash(dedupHash: string): Promise<ReportJob | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'dedupHash-index',
        KeyConditionExpression: 'dedupHash = :h',
        ExpressionAttributeValues: { ':h': dedupHash },
        Limit: 1,
      }),
    );
    const items = result.Items as ReportJob[] | undefined;
    return items?.[0] ?? null;
  }

  async updateStatus(
    jobId: string,
    status: JobStatus,
    extra?: Partial<ReportJob>,
  ): Promise<void> {
    const now = new Date().toISOString();
    const updates: string[] = ['#status = :status', 'updatedAt = :updatedAt'];
    const names: Record<string, string> = { '#status': 'status' };
    const values: Record<string, unknown> = {
      ':status': status,
      ':updatedAt': now,
    };

    if (extra) {
      Object.entries(extra).forEach(([k, v], i) => {
        if (v !== undefined) {
          updates.push(`#f${i} = :f${i}`);
          names[`#f${i}`] = k;
          values[`:f${i}`] = v;
        }
      });
    }

    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { jobId },
        UpdateExpression: `SET ${updates.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
  }
}
