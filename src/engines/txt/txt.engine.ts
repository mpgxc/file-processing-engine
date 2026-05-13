import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { EngineError } from '../../commons/errors/app-errors.js';
import {
  EngineContext,
  EngineResult,
} from '../../commons/types/engine.types.js';
import { ReportFormat } from '../../commons/types/job.types.js';
import { IReportEngine } from '../core/engine.interface.js';

function toSafeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

@Injectable()
export class TxtEngine implements IReportEngine {
  readonly format = ReportFormat.TXT;

  constructor() {
    Handlebars.registerHelper('padLeft', (str: unknown, n: number) =>
      toSafeString(str).padStart(n, ' '),
    );
    Handlebars.registerHelper('padRight', (str: unknown, n: number) =>
      toSafeString(str).padEnd(n, ' '),
    );
    Handlebars.registerHelper('zerofill', (n: unknown, width: number) =>
      toSafeString(n || '0').padStart(width, '0'),
    );
    Handlebars.registerHelper('formatDate', (value: unknown, fmt?: string) => {
      const d = new Date(toSafeString(value));
      if (fmt === 'DDMMYYYY') {
        // UTC for deterministic output (fixed-width text formats like CNAB
        // must not depend on the host timezone)
        return `${d.getUTCDate().toString().padStart(2, '0')}${(d.getUTCMonth() + 1).toString().padStart(2, '0')}${d.getUTCFullYear()}`;
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

  generate(ctx: EngineContext): Promise<EngineResult> {
    const start = Date.now();
    try {
      const templateStr = readFileSync(ctx.templatePath, 'utf8');
      const rendered = Handlebars.compile(templateStr)(ctx.job.params);
      const encoding =
        (ctx.job.params['encoding'] as BufferEncoding | undefined) ?? 'utf8';

      mkdirSync(dirname(ctx.outputPath), { recursive: true });
      writeFileSync(ctx.outputPath, rendered, encoding);

      const { size } = statSync(ctx.outputPath);
      return Promise.resolve({
        outputPath: ctx.outputPath,
        sizeBytes: size,
        durationMs: Date.now() - start,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.constructor.name === 'EngineError')
        throw err;
      throw new EngineError('TxtEngine', err);
    }
  }
}
