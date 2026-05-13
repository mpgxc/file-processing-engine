import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let client: DynamoDBDocumentClient | null = null;

export function getDynamoDbClient(): DynamoDBDocumentClient {
  if (client) return client;
  const endpoint = process.env['AWS_DYNAMODB_ENDPOINT'];
  const ddb = new DynamoDBClient(endpoint ? { endpoint } : {});
  client = DynamoDBDocumentClient.from(ddb, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return client;
}
