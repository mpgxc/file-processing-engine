import { Injectable } from '@nestjs/common';
import { readFileSync, mkdirSync, createWriteStream, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { stringify } from 'csv-stringify';
import { IReportEngine } from '../core/engine.interface';
import { EngineContext, EngineResult } from '../../commons/types/engine.types';
import { ReportFormat } from '../../commons/types/job.types';
import { EngineError } from '../../commons/errors/app-errors';

interface CsvColumn {
  key: string;
  header: string;
  format?: 'date' | 'currency' | 'cpf';
}

interface CsvSchema {
  columns: CsvColumn[];
  delimiter?: string;
  bom?: boolean;
}

function toSafeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

function formatValue(value: unknown, fmt?: CsvColumn['format']): string {
  if (value === undefined || value === null) return '';
  if (fmt === 'date')
    return new Date(toSafeString(value)).toLocaleDateString('pt-BR');
  if (fmt === 'currency') {
    return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }
  if (fmt === 'cpf')
    return toSafeString(value).replace(
      /(\d{3})(\d{3})(\d{3})(\d{2})/,
      '$1.$2.$3-$4',
    );
  return toSafeString(value);
}

@Injectable()
export class CsvEngine implements IReportEngine {
  readonly format = ReportFormat.CSV;

  async generate(ctx: EngineContext): Promise<EngineResult> {
    const start = Date.now();
    try {
      const schemaStr = readFileSync(ctx.templatePath, 'utf8');
      const schema = JSON.parse(schemaStr) as CsvSchema;
      const rows = (ctx.job.params['rows'] ?? []) as Record<string, unknown>[];

      mkdirSync(dirname(ctx.outputPath), { recursive: true });
      const writeStream = createWriteStream(ctx.outputPath);

      if (schema.bom) writeStream.write('﻿');

      const stringifier = stringify({
        delimiter: schema.delimiter ?? ',',
        header: true,
        columns: schema.columns.map((c) => ({ key: c.key, header: c.header })),
      });

      await new Promise<void>((resolve, reject) => {
        stringifier.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
        stringifier.pipe(writeStream);

        for (const row of rows) {
          const formatted: Record<string, string> = {};
          for (const col of schema.columns) {
            formatted[col.key] = formatValue(row[col.key], col.format);
          }
          stringifier.write(formatted);
        }
        stringifier.end();
      });

      const { size } = statSync(ctx.outputPath);
      return {
        outputPath: ctx.outputPath,
        sizeBytes: size,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.constructor.name === 'EngineError')
        throw err;
      throw new EngineError('CsvEngine', err);
    }
  }
}
