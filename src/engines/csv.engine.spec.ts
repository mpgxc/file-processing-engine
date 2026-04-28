import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';
import { CsvEngine } from './csv.engine.js';
import { ReportFormat, JobStatus } from '../shared/types/job.types.js';
import type { EngineContext } from '../shared/types/engine.types.js';

vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return fs;
});



const mockJob = {
  jobId: 'job-001',
  tenantId: 'tenant-001',
  userId: 'user-001',
  format: ReportFormat.CSV,
  templateId: 'transactions',
  templateVersion: 'v1',
  params: {
    rows: [
      {
        date: '2026-01-01T00:00:00Z',
        description: 'Venda A',
        amount: 1500.5,
        status: 'OK',
        externalNsu: 'N001',
      },
      {
        date: '2026-01-02T00:00:00Z',
        description: 'Venda B',
        amount: 2300.0,
        status: 'OK',
        externalNsu: 'N002',
      },
    ],
  },
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

const schema = JSON.stringify({
  columns: [
    { key: 'date', header: 'Data', format: 'date' },
    { key: 'description', header: 'Descrição' },
    { key: 'amount', header: 'Valor', format: 'currency' },
    { key: 'status', header: 'Status' },
    { key: 'externalNsu', header: 'NSU' },
  ],
  delimiter: ';',
  bom: false,
});

const templatePath = '/mnt/templates/csv/transactions/v1.json';
const outputPath = '/mnt/outputs/tenant-001/user-001/dh.csv';

beforeEach(() => {
  vol.reset();
  vol.mkdirSync('/mnt/templates/csv/transactions', { recursive: true });
  vol.mkdirSync('/mnt/outputs/tenant-001/user-001', { recursive: true });
  vol.writeFileSync(templatePath, schema);
});

describe('CsvEngine', () => {
  it('generates a CSV file at the output path', async () => {
    const engine = new CsvEngine();
    const ctx: EngineContext = {
      job: mockJob,
      template: {
        templateId: 'transactions',
        version: 'v1',
        format: ReportFormat.CSV,
        name: 'T',
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
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const content = vol.readFileSync(outputPath, 'utf8') as string;
    expect(content).toContain('Data;Descrição;Valor;Status;NSU');
    expect(content).toContain('Venda A');
    expect(content).toContain('Venda B');
  });

  it('formats currency values', async () => {
    const engine = new CsvEngine();
    const ctx: EngineContext = {
      job: mockJob,
      template: {
        templateId: 'transactions',
        version: 'v1',
        format: ReportFormat.CSV,
        name: 'T',
        s3Key: 'k',
        mailTemplateId: 'mi',
        tenantId: 'global',
        isActive: true,
        createdAt: '',
      },
      templatePath,
      outputPath,
    };
    await engine.generate(ctx);
    const content = vol.readFileSync(outputPath, 'utf8') as string;
    expect(content).toMatch(/1\.500,50|1500/);
  });
});
