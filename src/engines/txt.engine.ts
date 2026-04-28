import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { EngineError } from '../shared/errors/app-errors.js';
import { EngineContext, EngineResult } from '../shared/types/engine.types.js';
import { ReportFormat } from '../shared/types/job.types.js';
import { IReportEngine } from './engine.interface.js';

@Injectable()
export class TxtEngine implements IReportEngine {
  readonly format = ReportFormat.TXT;

  constructor() {
    Handlebars.registerHelper('padLeft', (str: unknown, n: number) =>
      String(str ?? '').padStart(n, ' '),
    );
    Handlebars.registerHelper('padRight', (str: unknown, n: number) =>
      String(str ?? '').padEnd(n, ' '),
    );
    Handlebars.registerHelper('zerofill', (n: unknown, width: number) =>
      String(n ?? '0').padStart(width, '0'),
    );
    Handlebars.registerHelper('formatDate', (value: unknown, fmt?: string) => {
      const d = new Date(String(value ?? ''));
      if (fmt === 'DDMMYYYY') {
        // UTC for deterministic output (fixed-width text formats like CNAB
        // must not depend on the host timezone)
        return `${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${d.getUTCFullYear()}`;
      }
      return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    });
    Handlebars.registerHelper('formatCurrency', (value: unknown) => {
      return Number(value ?? 0)
        .toFixed(2)
        .replace('.', '')
        .padStart(15, '0');
    });
  }

  async generate(ctx: EngineContext): Promise<EngineResult> {
    const start = Date.now();
    try {
      const templateStr = readFileSync(ctx.templatePath, 'utf8');
      const rendered = Handlebars.compile(templateStr)(ctx.job.params);
      const encoding =
        (ctx.job.params['encoding'] as BufferEncoding | undefined) ?? 'utf8';

      mkdirSync(dirname(ctx.outputPath), { recursive: true });
      writeFileSync(ctx.outputPath, rendered, encoding);

      const { size } = statSync(ctx.outputPath);
      return {
        outputPath: ctx.outputPath,
        sizeBytes: size,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.constructor.name === 'EngineError')
        throw err;
      throw new EngineError('TxtEngine', err);
    }
  }
}
