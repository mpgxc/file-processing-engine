import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDbClient } from '../../../commons/clients/dynamodb.client.js';
import { ReportTemplate } from '../../../commons/types/template.types.js';

export interface ITemplateRepository {
  findById(
    templateId: string,
    version?: string,
  ): Promise<ReportTemplate | null>;
  findActive(
    templateId: string,
    tenantId: string,
  ): Promise<ReportTemplate | null>;
}

interface CacheEntry {
  value: ReportTemplate;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

export class DynamoDbTemplateRepository implements ITemplateRepository {
  private readonly tableName = process.env['TEMPLATES_TABLE_NAME'] ?? '';
  private readonly client = getDynamoDbClient();
  private readonly cache = new Map<string, CacheEntry>();

  private getFromCache(key: string): ReportTemplate | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  private setCache(key: string, value: ReportTemplate): void {
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  async findById(
    templateId: string,
    version?: string,
  ): Promise<ReportTemplate | null> {
    const cacheKey = `${templateId}:${version ?? 'latest'}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    if (version) {
      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { templateId, version },
        }),
      );
      const item = (result.Item as ReportTemplate | undefined) ?? null;
      if (item) this.setCache(cacheKey, item);
      return item;
    }

    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'templateId = :tid',
        ExpressionAttributeValues: { ':tid': templateId },
        ScanIndexForward: false,
        Limit: 1,
      }),
    );
    const items = result.Items as ReportTemplate[] | undefined;
    const item = items?.[0] ?? null;
    if (item) this.setCache(cacheKey, item);
    return item;
  }

  async findActive(
    templateId: string,
    tenantId: string,
  ): Promise<ReportTemplate | null> {
    const cacheKey = `active:${templateId}:${tenantId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    // Query by templateId (PK) on the main table — GSI tenantId-format-index can't be
    // used here because its PK is tenantId, not templateId. Filter by tenantId + isActive.
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'templateId = :tid',
        FilterExpression:
          '(tenantId = :tId OR tenantId = :global) AND isActive = :active',
        ExpressionAttributeValues: {
          ':tid': templateId,
          ':tId': tenantId,
          ':global': 'global',
          ':active': true,
        },
        ScanIndexForward: false,
        Limit: 5,
      }),
    );
    const items = result.Items as ReportTemplate[] | undefined;
    const item = items?.[0] ?? null;
    if (item) this.setCache(cacheKey, item);
    return item;
  }
}
