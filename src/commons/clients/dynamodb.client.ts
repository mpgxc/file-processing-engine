import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let client: DynamoDBDocumentClient | null = null;

export function getDynamoDbClient(): DynamoDBDocumentClient {
  if (client) return client;
  const endpoint =
    process.env['AWS_DYNAMODB_ENDPOINT'] ?? process.env['AWS_ENDPOINT_URL'];
  const region = process.env['AWS_REGION'] ?? 'us-east-1';
  const ddb = new DynamoDBClient(endpoint ? { endpoint, region } : { region });
  client = DynamoDBDocumentClient.from(ddb, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return client;
}
