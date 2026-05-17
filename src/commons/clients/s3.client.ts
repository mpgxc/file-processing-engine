import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';
import { PutObjectCommand } from '@aws-sdk/client-s3';

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  const endpoint =
    process.env['AWS_S3_ENDPOINT'] ?? process.env['AWS_ENDPOINT_URL'];
  const region = process.env['AWS_REGION'] ?? 'us-east-1';
  s3Client = new S3Client(
    endpoint
      ? {
          endpoint,
          region,
          forcePathStyle: true,
        }
      : { region },
  );
  return s3Client;
}

export async function generatePresignedUrl(
  s3Key: string,
  ttlSeconds = 86400,
): Promise<string> {
  const bucket = process.env['OUTPUT_BUCKET_NAME'];
  if (!bucket) throw new Error('OUTPUT_BUCKET_NAME env var not set');
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
  return getSignedUrl(client, command, { expiresIn: ttlSeconds });
}

export async function uploadFileToOutputBucket(
  s3Key: string,
  filePath: string,
): Promise<void> {
  const bucket = process.env['OUTPUT_BUCKET_NAME'];
  if (!bucket) throw new Error('OUTPUT_BUCKET_NAME env var not set');
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: createReadStream(filePath),
    }),
  );
}
