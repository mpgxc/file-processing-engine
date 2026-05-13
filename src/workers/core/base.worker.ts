import { Injectable, Inject } from '@nestjs/common';
import type { SQSRecord } from 'aws-lambda';
import { existsSync } from 'node:fs';
import { EngineRegistry } from '../../engines/core/engine.registry.js';
import {
  resolveTemplatePath,
  resolveOutputPath,
  getExtension,
} from '../../engines/core/engine.interface.js';
import { IJobRepository } from '../../features/reporting/repositories/job.repository.js';
import { ITemplateRepository } from '../../features/reporting/repositories/template.repository.js';
import { REPOSITORY_TOKENS } from '../../features/reporting/repositories/repository-tokens.js';
import { MailService } from '../../mail/mail.service.js';
import { generatePresignedUrl } from '../../commons/clients/s3.client.js';
import { JobStatus } from '../../commons/types/job.types.js';
import { ReportJobMessage } from '../../commons/types/sqs.types.js';
import { MountNotAvailableError } from '../../commons/errors/app-errors.js';
import { ConfigService } from '../../core/config/config.service.js';

@Injectable()
export class BaseWorker {
  constructor(
    private readonly engineRegistry: EngineRegistry,
    @Inject(REPOSITORY_TOKENS.JOB) private readonly jobRepo: IJobRepository,
    @Inject(REPOSITORY_TOKENS.TEMPLATE)
    private readonly templateRepo: ITemplateRepository,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  async processRecord(record: SQSRecord): Promise<void> {
    const message = JSON.parse(record.body) as ReportJobMessage;

    const job = await this.jobRepo.findById(message.jobId);
    if (!job || job.status !== JobStatus.PENDING) {
      return;
    }

    await this.jobRepo.updateStatus(job.jobId, JobStatus.PROCESSING);

    try {
      const template = await this.templateRepo.findById(
        job.templateId,
        job.templateVersion,
      );
      if (!template) {
        throw new Error(
          `Template ${job.templateId}@${job.templateVersion} not found`,
        );
      }

      const templatesMountPath = this.config.get('templatesMountPath');
      const outputsMountPath = this.config.get('outputsMountPath');

      if (!existsSync(templatesMountPath)) {
        throw new MountNotAvailableError(templatesMountPath);
      }

      const templatePath = resolveTemplatePath(template, templatesMountPath);
      const outputPath = resolveOutputPath(job, outputsMountPath);

      const engine = this.engineRegistry.resolve(job.format);
      await engine.generate({ job, template, templatePath, outputPath });

      const ext = getExtension(job.format);
      const s3Key = `${job.tenantId}/${job.userId}/${job.dedupHash}.${ext}`;
      const downloadUrl = await generatePresignedUrl(s3Key);

      await this.mailService.sendReportReady({
        to: job.recipientEmail,
        recipientName: job.recipientName,
        locale: job.locale,
        reportTitle: `Relatório ${job.format}`,
        format: job.format,
        downloadUrl,
        expiresAt: new Date(Date.now() + 86400 * 1000),
        jobId: job.jobId,
        mailTemplateId: template.mailTemplateId,
      });

      await this.jobRepo.updateStatus(job.jobId, JobStatus.DONE, {
        s3OutputKey: s3Key,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.jobRepo.updateStatus(job.jobId, JobStatus.FAILED, {
        errorMessage: msg,
      });
      throw err;
    }
  }
}
