import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  s3Client = new S3Client({});
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
