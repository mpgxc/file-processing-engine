import { Inject, Injectable } from '@nestjs/common';
import { metrics, MetricUnit } from '../../../core/observability/powertools.js';
import { IJobRepository } from '../repositories/job.repository.js';
import { ITemplateRepository } from '../repositories/template.repository.js';
import {
  SqsPublisher,
  resolveQueueUrl,
} from '../../../commons/clients/sqs.client.js';
import { generatePresignedUrl } from '../../../commons/clients/s3.client.js';
import {
  computeParamsHash,
  computeDedupHash,
} from '../../../commons/utils/hash.js';
import { ulid } from '../../../commons/utils/ulid.js';
import {
  JobNotFoundError,
  TemplateNotFoundError,
} from '../../../commons/errors/app-errors.js';
import { JobStatus, ReportJob } from '../../../commons/types/job.types.js';
import {
  GenerateReportCacheHit,
  GenerateReportResponse,
  JobStatusResponse,
} from '../../../commons/types/api.types.js';
import { GenerateReportDto } from './dto/generate-report.dto.js';
import { REPOSITORY_TOKENS } from '../repositories/repository-tokens.js';

@Injectable()
export class ReportsService {
  private readonly publisher = new SqsPublisher();

  constructor(
    @Inject(REPOSITORY_TOKENS.JOB) private readonly jobRepo: IJobRepository,
    @Inject(REPOSITORY_TOKENS.TEMPLATE)
    private readonly templateRepo: ITemplateRepository,
  ) {}

  async generate(
    dto: GenerateReportDto,
    tenantId: string,
    userId: string,
  ): Promise<GenerateReportResponse | GenerateReportCacheHit> {
    metrics.addMetric('reportRequests', MetricUnit.Count, 1);

    const template = await this.templateRepo.findActive(
      dto.templateId,
      tenantId,
    );
    if (!template) throw new TemplateNotFoundError(dto.templateId);

    const paramsHash = computeParamsHash(dto.params);
    const dedupHash = computeDedupHash(
      tenantId,
      userId,
      dto.format,
      dto.templateId,
      paramsHash,
    );

    const existing = await this.jobRepo.findByDedupHash(dedupHash);

    if (existing?.status === JobStatus.DONE && existing.s3OutputKey) {
      const downloadUrl = await generatePresignedUrl(existing.s3OutputKey);
      const result: GenerateReportCacheHit = {
        jobId: existing.jobId,
        status: 'DONE',
        downloadUrl,
        expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
      };
      metrics.addMetric('cacheHits', MetricUnit.Count, 1);
      return result;
    }

    if (
      existing?.status === JobStatus.PENDING ||
      existing?.status === JobStatus.PROCESSING
    ) {
      return {
        jobId: existing.jobId,
        status: existing.status,
        message: 'Job já em processamento',
      };
    }

    const now = new Date().toISOString();
    const job: ReportJob = {
      jobId: ulid(),
      tenantId,
      userId,
      format: dto.format,
      templateId: dto.templateId,
      templateVersion: template.version,
      params: dto.params,
      paramsHash,
      dedupHash,
      status: JobStatus.PENDING,
      recipientEmail: dto.recipientEmail,
      recipientName: dto.recipientName,
      locale: dto.locale ?? 'pt-BR',
      createdAt: now,
      updatedAt: now,
      expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    };

    await this.jobRepo.create(job);
    const queueUrl = resolveQueueUrl(dto.format);
    await this.publisher.publishJob(queueUrl, {
      jobId: job.jobId,
      format: job.format,
      dedupHash: job.dedupHash,
    });

    return {
      jobId: job.jobId,
      status: JobStatus.PENDING,
      message: 'Relatório enfileirado com sucesso',
    };
  }

  async getStatus(jobId: string): Promise<JobStatusResponse> {
    const job = await this.jobRepo.findById(jobId);
    if (!job) throw new JobNotFoundError(jobId);

    let downloadUrl: string | undefined;
    if (job.status === JobStatus.DONE && job.s3OutputKey) {
      downloadUrl = await generatePresignedUrl(job.s3OutputKey);
    }

    return {
      jobId: job.jobId,
      status: job.status,
      downloadUrl,
      format: job.format,
      createdAt: job.createdAt,
    };
  }
}
