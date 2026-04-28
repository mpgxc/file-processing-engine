import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { Test } from '@nestjs/testing';
import { MailService } from './mail.service.js';
import { SesMailer } from '../shared/clients/ses.client.js';
import { ConfigService } from '../config/config.service.js';
import { ReportFormat } from '../shared/types/job.types.js';



vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return fs;
});

const HTML_TEMPLATE =
  '{{!-- subject: Relatório Pronto --}}<html><body>Olá {{recipientName}} <a href="{{downloadUrl}}">Baixar</a></body></html>';
const TXT_TEMPLATE =
  '{{!-- subject: Relatório Pronto --}}Olá {{recipientName}} - {{downloadUrl}}';

describe('MailService', () => {
  let service: MailService;
  let sesMailer: { send: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vol.reset();
    sesMailer = { send: vi.fn().mockResolvedValue(undefined) };
    configService = { get: vi.fn().mockReturnValue('/mnt/templates') };

    const module = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: SesMailer, useValue: sesMailer },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(MailService);
  });

  const baseParams = {
    to: 'user@example.com',
    recipientName: 'João',
    locale: 'pt-BR',
    reportTitle: 'Relatório Mensal',
    format: ReportFormat.PDF,
    downloadUrl: 'https://example.com/download',
    expiresAt: new Date('2026-05-01T10:00:00Z'),
    jobId: 'job-001',
    mailTemplateId: 'report-ready',
  };

  it('uses mount template when available', async () => {
    vol.mkdirSync('/mnt/templates/mail/report-ready', { recursive: true });
    vol.writeFileSync(
      '/mnt/templates/mail/report-ready/pt-BR.hbs',
      HTML_TEMPLATE,
    );
    vol.writeFileSync(
      '/mnt/templates/mail/report-ready/pt-BR.txt.hbs',
      TXT_TEMPLATE,
    );

    await service.sendReportReady(baseParams);

    expect(sesMailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Relatório Pronto',
        htmlBody: expect.stringContaining('João'),
      }),
    );
  });

  it('falls back to built-in template when mount unavailable', async () => {
    // mount empty → loadBuiltin() reads from process.cwd()/src/mail/templates/...
    // Populate the memfs-mocked filesystem at that path so the fallback works.
    const builtinDir = `${process.cwd()}/src/mail/templates/report-ready`;
    vol.mkdirSync(builtinDir, { recursive: true });
    vol.writeFileSync(`${builtinDir}/pt-BR.hbs`, HTML_TEMPLATE);
    vol.writeFileSync(`${builtinDir}/pt-BR.txt.hbs`, TXT_TEMPLATE);

    await service.sendReportReady(baseParams);
    expect(sesMailer.send).toHaveBeenCalled();
  });

  it('falls back to pt-BR when locale not found', async () => {
    vol.mkdirSync('/mnt/templates/mail/report-ready', { recursive: true });
    vol.writeFileSync(
      '/mnt/templates/mail/report-ready/pt-BR.hbs',
      HTML_TEMPLATE,
    );
    vol.writeFileSync(
      '/mnt/templates/mail/report-ready/pt-BR.txt.hbs',
      TXT_TEMPLATE,
    );

    await service.sendReportReady({ ...baseParams, locale: 'es-MX' });
    expect(sesMailer.send).toHaveBeenCalled();
  });
});
