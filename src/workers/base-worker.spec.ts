import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { BaseWorker } from './base-worker.js';
import { EngineRegistry } from '../engines/engine.registry.js';
import { IJobRepository } from '../shared/repositories/job.repository.js';
import { ITemplateRepository } from '../shared/repositories/template.repository.js';
import { MailService } from '../mail/mail.service.js';
import { ConfigService } from '../config/config.service.js';
import { JobStatus, ReportFormat } from '../shared/types/job.types.js';
import type { SQSRecord } from 'aws-lambda';

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('../shared/clients/s3.client.js', () => ({
  generatePresignedUrl: vi
    .fn()
    .mockResolvedValue('https://presigned.url/file.pdf'),
}));

vi.mock('../engines/engine.interface.js', () => ({
  resolveTemplatePath: vi.fn().mockReturnValue('/mnt/templates/pdf/tpl/v1.pdf'),
  resolveOutputPath: vi.fn().mockReturnValue('/mnt/outputs/t/u/hash.pdf'),
  getExtension: vi.fn().mockReturnValue('pdf'),
}));

const makeRecord = (body: object): SQSRecord =>
  ({ body: JSON.stringify(body) }) as SQSRecord;

const baseJob = {
  jobId: 'job-001',
  tenantId: 'tenant-1',
  userId: 'user-1',
  format: ReportFormat.PDF,
  templateId: 'tpl',
  templateVersion: 'v1',
  params: {},
  paramsHash: 'ph',
  dedupHash: 'dh',
  status: JobStatus.PENDING,
  recipientEmail: 'u@e.com',
  recipientName: 'User',
  locale: 'pt-BR',
  createdAt: '',
  updatedAt: '',
  expiresAt: 9999999999,
};

const baseTemplate = {
  templateId: 'tpl',
  version: 'v1',
  format: ReportFormat.PDF,
  name: 'T',
  s3Key: 'k',
  mailTemplateId: 'mi',
  tenantId: 'global',
  isActive: true,
  createdAt: '',
};

describe('BaseWorker', () => {
  let worker: BaseWorker;
  let jobRepo: {
    findById: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
  };
  let templateRepo: { findById: ReturnType<typeof vi.fn> };
  let engineRegistry: { resolve: ReturnType<typeof vi.fn> };
  let mailService: { sendReportReady: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    jobRepo = {
      findById: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };
    templateRepo = { findById: vi.fn() };
    engineRegistry = { resolve: vi.fn() };
    mailService = { sendReportReady: vi.fn().mockResolvedValue(undefined) };
    configService = { get: vi.fn().mockReturnValue('./fixtures/templates') };

    const module = await Test.createTestingModule({
      providers: [
        BaseWorker,
        { provide: EngineRegistry, useValue: engineRegistry },
        { provide: 'JOB_REPOSITORY', useValue: jobRepo },
        { provide: 'TEMPLATE_REPOSITORY', useValue: templateRepo },
        { provide: MailService, useValue: mailService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    worker = module.get(BaseWorker);
  });

  it('happy path: PENDING → PROCESSING → generate → email → DONE', async () => {
    jobRepo.findById.mockResolvedValue({ ...baseJob });
    templateRepo.findById.mockResolvedValue(baseTemplate);
    const mockGenerate = vi
      .fn()
      .mockResolvedValue({
        outputPath: '/out.pdf',
        sizeBytes: 100,
        durationMs: 50,
      });
    engineRegistry.resolve.mockReturnValue({ generate: mockGenerate });

    await worker.processRecord(
      makeRecord({ jobId: 'job-001', format: 'PDF', dedupHash: 'dh' }),
    );

    expect(jobRepo.updateStatus).toHaveBeenCalledWith(
      'job-001',
      JobStatus.PROCESSING,
    );
    expect(mockGenerate).toHaveBeenCalled();
    expect(mailService.sendReportReady).toHaveBeenCalled();
    expect(jobRepo.updateStatus).toHaveBeenCalledWith(
      'job-001',
      JobStatus.DONE,
      expect.any(Object),
    );
  });

  it('skips when job not found', async () => {
    jobRepo.findById.mockResolvedValue(null);
    await worker.processRecord(
      makeRecord({ jobId: 'missing', format: 'PDF', dedupHash: 'dh' }),
    );
    expect(jobRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('skips when job is already PROCESSING', async () => {
    jobRepo.findById.mockResolvedValue({
      ...baseJob,
      status: JobStatus.PROCESSING,
    });
    await worker.processRecord(
      makeRecord({ jobId: 'job-001', format: 'PDF', dedupHash: 'dh' }),
    );
    expect(jobRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('sets FAILED status and rethrows on engine error', async () => {
    jobRepo.findById.mockResolvedValue({ ...baseJob });
    templateRepo.findById.mockResolvedValue(baseTemplate);
    engineRegistry.resolve.mockReturnValue({
      generate: vi.fn().mockRejectedValue(new Error('render failed')),
    });

    await expect(
      worker.processRecord(
        makeRecord({ jobId: 'job-001', format: 'PDF', dedupHash: 'dh' }),
      ),
    ).rejects.toThrow('render failed');

    expect(jobRepo.updateStatus).toHaveBeenCalledWith(
      'job-001',
      JobStatus.FAILED,
      expect.objectContaining({ errorMessage: 'render failed' }),
    );
  });
});
