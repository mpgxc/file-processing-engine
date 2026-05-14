import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const rootDir = process.cwd();
const awsEndpoint = process.env['AWS_ENDPOINT_URL'] ?? 'http://localhost:4566';
const awsRegion = process.env['AWS_REGION'] ?? 'us-east-1';
const templateBucket = process.env['TEMPLATE_BUCKET_NAME'] ?? 'report-service-templates-local';
const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 5000;

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function checkCommand(command: string, args: string[] = ['--version']): void {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  if (result.status !== 0) {
    throw new Error(`Missing required command: ${command}`);
  }
}

async function waitForMiniStack(): Promise<void> {
  const client = new DynamoDBClient({ endpoint: awsEndpoint, region: awsRegion });
  const retries = 30;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await client.send(new ListTablesCommand({}));
      console.log('MiniStack is healthy.');
      return;
    } catch {
      process.stdout.write(`Waiting for MiniStack (${attempt}/${retries})...\n`);
      const backoffMs = Math.min(INITIAL_BACKOFF_MS * attempt, MAX_BACKOFF_MS);
      await sleep(backoffMs);
    }
  }

  throw new Error('MiniStack did not become healthy in time.');
}

function collectFiles(baseDir: string): string[] {
  const entries = readdirSync(baseDir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(baseDir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

async function syncTemplatesToS3(): Promise<void> {
  const s3 = new S3Client({
    endpoint: process.env['AWS_S3_ENDPOINT'] ?? awsEndpoint,
    region: awsRegion,
    forcePathStyle: true,
  });
  const baseDir = join(rootDir, 'fixtures', 'templates');
  const files = collectFiles(baseDir);

  for (const filePath of files) {
    const key = relative(baseDir, filePath).replace(/\\/g, '/');
    await s3.send(
      new PutObjectCommand({
        Bucket: templateBucket,
        Key: key,
        Body: readFileSync(filePath),
      }),
    );
  }

  console.log(`Synced ${files.length} template files to s3://${templateBucket}`);
}

async function main(): Promise<void> {
  checkCommand('docker');
  checkCommand('npm');

  run('docker', ['compose', 'up', '-d', 'ministack']);
  await waitForMiniStack();

  run('npm', ['run', 'seed:local']);
  await syncTemplatesToS3();

  console.log('Local bootstrap complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
