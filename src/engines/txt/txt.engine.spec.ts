import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';
import { TxtEngine } from './txt.engine';
import { ReportFormat, JobStatus } from '../../commons/types/job.types';
import type { EngineContext } from '../../commons/types/engine.types';

vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return fs;
});

const templateContent =
  '{{padRight name 20}}{{zerofill code 5}}{{formatDate date "DDMMYYYY"}}';
const templatePath = '/mnt/templates/txt/remessa/v1.hbs';
const outputPath = '/mnt/outputs/t/u/dh.txt';

const mockJob = {
  jobId: 'j1',
  tenantId: 't',
  userId: 'u',
  format: ReportFormat.TXT,
  templateId: 'remessa',
  templateVersion: 'v1',
  params: { name: 'ACME', code: 42, date: '2026-04-26T00:00:00Z' },
  paramsHash: 'ph',
  dedupHash: 'dh',
  status: JobStatus.PENDING,
  recipientEmail: 'u@e.com',
  recipientName: 'User',
  locale: 'pt-BR',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  expiresAt: 9999999999,
};

beforeEach(() => {
  vol.reset();
  vol.mkdirSync('/mnt/templates/txt/remessa', { recursive: true });
  vol.mkdirSync('/mnt/outputs/t/u', { recursive: true });
  vol.writeFileSync(templatePath, templateContent);
});

describe('TxtEngine', () => {
  it('renders template and writes file', async () => {
    const engine = new TxtEngine();
    const ctx: EngineContext = {
      job: mockJob,
      template: {
        templateId: 'remessa',
        version: 'v1',
        format: ReportFormat.TXT,
        name: 'R',
        s3Key: 'k',
        mailTemplateId: 'mi',
        tenantId: 'global',
        isActive: true,
        createdAt: '',
      },
      templatePath,
      outputPath,
    };
    const result = await engine.generate(ctx);

    expect(result.outputPath).toBe(outputPath);
    expect(result.sizeBytes).toBeGreaterThan(0);

    const content = vol.readFileSync(outputPath, 'utf8') as string;
    expect(content).toContain('ACME');
    expect(content).toContain('00042');
    expect(content).toContain('26042026');
  });

  it('writes with latin1 encoding when configured', async () => {
    const engine = new TxtEngine();
    const jobWithEncoding = {
      ...mockJob,
      params: { ...mockJob.params, encoding: 'latin1' },
    };
    const ctx: EngineContext = {
      job: jobWithEncoding,
      template: {
        templateId: 'remessa',
        version: 'v1',
        format: ReportFormat.TXT,
        name: 'R',
        s3Key: 'k',
        mailTemplateId: 'mi',
        tenantId: 'global',
        isActive: true,
        createdAt: '',
      },
      templatePath,
      outputPath,
    };
    const result = await engine.generate(ctx);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });
});
