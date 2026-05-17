import { Injectable } from '@nestjs/common';
import { readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import Handlebars from 'handlebars';
import { IReportEngine } from '../core/engine.interface';
import { EngineContext, EngineResult } from '../../commons/types/engine.types';
import { ReportFormat } from '../../commons/types/job.types';
import { EngineError } from '../../commons/errors/app-errors';

function toSafeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

@Injectable()
export class PdfEngine implements IReportEngine {
  readonly format = ReportFormat.PDF;

  constructor() {
    Handlebars.registerHelper('formatDate', (value: unknown) => {
      if (!value) return '';
      return new Date(toSafeString(value)).toLocaleDateString('pt-BR');
    });
    Handlebars.registerHelper('formatCurrency', (value: unknown) => {
      const num = Number(value);
      if (isNaN(num)) return '0,00';
      return num.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    });
    Handlebars.registerHelper('formatCPF', (value: unknown) => {
      const s = toSafeString(value).replace(/\D/g, '');
      return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    });
  }

  async generate(ctx: EngineContext): Promise<EngineResult> {
    const start = Date.now();
    try {
      const templateStr = readFileSync(ctx.templatePath, 'utf8');
      const html = Handlebars.compile(templateStr)(ctx.job.params);

      // Dynamic import to support Lambda environments
      const chromium = await import('@sparticuz/chromium-min');
      const puppeteer = await import('puppeteer-core');

      const browser = await puppeteer.default.launch({
        args: chromium.default.args,
        executablePath: await chromium.default.executablePath(),
        headless: true,
      });

      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'load' });
        await page.waitForNetworkIdle();
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
        });

        mkdirSync(dirname(ctx.outputPath), { recursive: true });
        writeFileSync(ctx.outputPath, pdfBuffer);
      } finally {
        await browser.close();
      }

      const { size } = statSync(ctx.outputPath);
      return {
        outputPath: ctx.outputPath,
        sizeBytes: size,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.constructor.name === 'EngineError')
        throw err;
      throw new EngineError('PdfEngine', err);
    }
  }
}
