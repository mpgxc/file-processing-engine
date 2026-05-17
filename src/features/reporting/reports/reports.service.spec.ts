import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { JobStatus, ReportFormat } from '../../../commons/types/job.types';
import { REPOSITORY_TOKENS } from '../repositories/repository-tokens';

vi.mock('../../../commons/clients/sqs.client.js', () => ({
  SqsPublisher: vi.fn().mockImplementation(() => ({
    publishJob: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
  })),
  resolveQueueUrl: vi
    .fn()
    .mockReturnValue('https://sqs.us-east-1.amazonaws.com/000/pdf-queue'),
}));

vi.mock('../../../commons/clients/s3.client.js', () => ({
  generatePresignedUrl: vi
    .fn()
    .mockResolvedValue('https://presigned.url/file.pdf'),
}));

vi.mock('../../../commons/utils/ulid.js', () => ({
  ulid: vi.fn().mockReturnValue('01FIXED-ULID-FOR-TEST'),
}));

vi.mock('../../../commons/utils/hash.js', () => ({
  computeParamsHash: vi.fn().mockReturnValue('params-hash'),
  computeDedupHash: vi.fn().mockReturnValue('dedup-hash'),
}));

const baseTemplate = {
  templateId: 'tpl-001',
  version: 'v1',
  format: ReportFormat.PDF,
  name: 'Test Template',
  s3Key: 'pdf/tpl-001/v1.hbs',
  mailTemplateId: 'report-ready',
  tenantId: 'global',
  isActive: true,
  createdAt: new Date().toISOString(),
};

const generateDto = {
  format: ReportFormat.PDF,
  templateId: 'tpl-001',
  params: { foo: 'bar' },
  recipientEmail: 'user@example.com',
  recipientName: 'User',
  locale: 'pt-BR',
};

describe('ReportsService', () => {
  let service: ReportsService;
  let jobRepo: {
    findByDedupHash: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let templateRepo: { findActive: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    jobRepo = {
      findByDedupHash: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
    };
    templateRepo = { findActive: vi.fn().mockResolvedValue(baseTemplate) };

    const module = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: REPOSITORY_TOKENS.JOB, useValue: jobRepo },
        { provide: REPOSITORY_TOKENS.TEMPLATE, useValue: templateRepo },
      ],
    }).compile();

    service = module.get(ReportsService);
  });

  it('creates new job and returns 202 when no dedup hit', async () => {
    const result = await service.generate(generateDto, 'tenant-1', 'user-1');
    expect(jobRepo.create).toHaveBeenCalled();
    expect(result).toMatchObject({
      status: JobStatus.PENDING,
      jobId: '01FIXED-ULID-FOR-TEST',
    });
  });

  it('returns cache hit (200) when DONE job found', async () => {
    jobRepo.findByDedupHash.mockResolvedValue({
      jobId: 'existing-job',
      status: JobStatus.DONE,
      s3OutputKey: 'tenant-1/user-1/hash.pdf',
    });
    const result = await service.generate(generateDto, 'tenant-1', 'user-1');
    expect(jobRepo.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'DONE',
      downloadUrl: 'https://presigned.url/file.pdf',
    });
  });

  it('returns 202 with existing jobId when PENDING', async () => {
    jobRepo.findByDedupHash.mockResolvedValue({
      jobId: 'pending-job',
      status: JobStatus.PENDING,
    });
    const result = await service.generate(generateDto, 'tenant-1', 'user-1');
    expect(result).toMatchObject({
      jobId: 'pending-job',
      status: JobStatus.PENDING,
    });
  });

  it('throws TemplateNotFoundError when template not found', async () => {
    templateRepo.findActive.mockResolvedValue(null);
    await expect(
      service.generate(generateDto, 'tenant-1', 'user-1'),
    ).rejects.toThrow('not found');
  });

  it('getStatus returns DONE with downloadUrl', async () => {
    jobRepo.findById.mockResolvedValue({
      jobId: 'j1',
      status: JobStatus.DONE,
      s3OutputKey: 'k.pdf',
      format: ReportFormat.PDF,
      createdAt: new Date().toISOString(),
    });
    const result = await service.getStatus('j1');
    expect(result.downloadUrl).toBe('https://presigned.url/file.pdf');
  });

  it('throws JobNotFoundError on getStatus with unknown id', async () => {
    jobRepo.findById.mockResolvedValue(null);
    await expect(service.getStatus('unknown')).rejects.toThrow('not found');
  });
});
