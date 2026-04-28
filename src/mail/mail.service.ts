import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import { SesMailer } from '../shared/clients/ses.client.js';
import { ReportFormat } from '../shared/types/job.types.js';
import { ConfigService } from '../config/config.service.js';

export interface SendReportReadyParams {
  to: string;
  recipientName: string;
  locale: string;
  reportTitle: string;
  format: ReportFormat;
  downloadUrl: string;
  expiresAt: Date;
  jobId: string;
  tenantName?: string;
  mailTemplateId: string;
}

export interface IMailService {
  sendReportReady(params: SendReportReadyParams): Promise<void>;
}

function extractSubject(template: string): string {
  const match = /\{\{!-- subject: (.+?) --\}\}/.exec(template);
  return match?.[1] ?? 'Seu relatório está pronto';
}

function formatDate(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function loadBuiltin(filename: string): string {
  // Try src/ (dev) then dist/ (compiled) — works in CJS (NestJS CLI) and esbuild bundles
  const candidates = [
    join(process.cwd(), 'src/mail/templates/report-ready', filename),
    join(process.cwd(), 'dist/mail/templates/report-ready', filename),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  throw new Error(`Built-in mail template not found: ${filename}`);
}

@Injectable()
export class MailService implements IMailService {
  constructor(
    private readonly sesMailer: SesMailer,
    private readonly config: ConfigService,
  ) {}

  async sendReportReady(params: SendReportReadyParams): Promise<void> {
    const mountBase = this.config.get('templatesMountPath');
    const { locale, mailTemplateId } = params;

    const htmlTemplate = this.loadTemplate(
      mountBase,
      mailTemplateId,
      locale,
      '.hbs',
    );
    const txtTemplate = this.loadTemplate(
      mountBase,
      mailTemplateId,
      locale,
      '.txt.hbs',
    );

    const vars = {
      recipientName: params.recipientName,
      reportTitle: params.reportTitle,
      format: params.format.toUpperCase(),
      downloadUrl: params.downloadUrl,
      expiresAtFormatted: formatDate(params.expiresAt),
      jobId: params.jobId,
      tenantName: params.tenantName ?? '',
      currentYear: new Date().getFullYear(),
    };

    const subject = extractSubject(htmlTemplate);
    const htmlBody = Handlebars.compile(htmlTemplate)(vars);
    const textBody = Handlebars.compile(txtTemplate)(vars);

    await this.sesMailer.send({
      to: params.to,
      name: params.recipientName,
      subject,
      htmlBody,
      textBody,
    });
  }

  private loadTemplate(
    mountBase: string,
    mailTemplateId: string,
    locale: string,
    ext: string,
  ): string {
    const mountPath = `${mountBase}/mail/${mailTemplateId}/${locale}${ext}`;
    if (existsSync(mountPath)) return readFileSync(mountPath, 'utf8');

    const fallbackPath = `${mountBase}/mail/${mailTemplateId}/pt-BR${ext}`;
    if (existsSync(fallbackPath)) return readFileSync(fallbackPath, 'utf8');

    return loadBuiltin(ext === '.hbs' ? 'pt-BR.hbs' : 'pt-BR.txt.hbs');
  }
}
