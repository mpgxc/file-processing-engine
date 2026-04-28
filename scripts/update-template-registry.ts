import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';

const ENDPOINT = process.env['AWS_DYNAMODB_ENDPOINT'];
const TABLE = process.env['TEMPLATES_TABLE_NAME'] ?? 'report_templates';
const TEMPLATES_DIR = process.env['TEMPLATES_DIR'] ?? './fixtures/templates';

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient(ENDPOINT ? { endpoint: ENDPOINT, region: 'us-east-1' } : {}),
  { marshallOptions: { removeUndefinedValues: true } },
);

const FORMAT_MAP: Record<string, string> = {
  pdf: 'PDF',
  csv: 'CSV',
  xlsx: 'XLSX',
  txt: 'TXT',
};

function bumpPatch(version: string): string {
  const parts = version.replace(/^v/, '').split('.');
  if (parts.length === 1) {
    // Simple vN format → increment N
    const n = parseInt(parts[0] ?? '1', 10);
    return `v${n + 1}`;
  }
  // semver X.Y.Z
  const patch = parseInt(parts[2] ?? '0', 10);
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}

interface TemplateFile {
  format: string;
  templateId: string;
  version: string;
  s3Key: string;
}

function scanTemplates(baseDir: string): TemplateFile[] {
  const results: TemplateFile[] = [];

  for (const fmt of readdirSync(baseDir)) {
    const fmtPath = join(baseDir, fmt);
    if (!statSync(fmtPath).isDirectory()) continue;
    if (!FORMAT_MAP[fmt]) continue;

    for (const templateId of readdirSync(fmtPath)) {
      const tplPath = join(fmtPath, templateId);
      if (!statSync(tplPath).isDirectory()) continue;

      for (const file of readdirSync(tplPath)) {
        const ext = extname(file);
        if (!['.hbs', '.json', '.xlsx'].includes(ext)) continue;
        if (file.endsWith('.schema.json')) continue; // skip schema sidecars

        const version = basename(file, ext);
        const s3Key = relative(baseDir, join(tplPath, file)).replace(/\\/g, '/');

        results.push({ format: FORMAT_MAP[fmt] as string, templateId, version, s3Key: `${fmt}/${s3Key}` });
      }
    }
  }

  return results;
}

async function getCurrentVersion(templateId: string, format: string): Promise<string | null> {
  try {
    const result = await client.send(
      new GetCommand({ TableName: TABLE, Key: { templateId, version: 'latest' } }),
    );
    return (result.Item?.['version'] as string | undefined) ?? null;
  } catch {
    return null;
  }
}

async function upsert(tpl: TemplateFile): Promise<void> {
  const existing = await getCurrentVersion(tpl.templateId, tpl.format);
  const newVersion = existing ? bumpPatch(existing) : tpl.version;

  const item = {
    templateId: tpl.templateId,
    version: newVersion,
    format: tpl.format,
    name: tpl.templateId,
    s3Key: tpl.s3Key,
    mailTemplateId: 'report-ready',
    tenantId: 'global',
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  await client.send(new PutCommand({ TableName: TABLE, Item: item }));
  console.log(`Upserted: ${tpl.templateId} @ ${newVersion} (${tpl.format})`);
}

async function main() {
  const templates = scanTemplates(TEMPLATES_DIR);
  console.log(`Found ${templates.length} template(s) in ${TEMPLATES_DIR}`);

  for (const tpl of templates) {
    await upsert(tpl);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
