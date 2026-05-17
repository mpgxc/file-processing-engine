import { Injectable } from '@nestjs/common';
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import ExcelJS from 'exceljs';
import { IReportEngine } from '../core/engine.interface';
import { EngineContext, EngineResult } from '../../commons/types/engine.types';
import { ReportFormat } from '../../commons/types/job.types';
import { EngineError } from '../../commons/errors/app-errors';

interface NamedRange {
  name: string;
  dataKey: string;
}

interface SheetSchema {
  name: string;
  namedRanges: NamedRange[];
}

interface XlsxSchema {
  sheets: SheetSchema[];
}

@Injectable()
export class XlsxEngine implements IReportEngine {
  readonly format = ReportFormat.XLSX;

  async generate(ctx: EngineContext): Promise<EngineResult> {
    const start = Date.now();
    try {
      const schemaPath = ctx.templatePath.replace(/\.xlsx$/, '.schema.json');
      const schemaStr = readFileSync(schemaPath, 'utf8');
      const schema = JSON.parse(schemaStr) as XlsxSchema;

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(ctx.templatePath);

      for (const sheetDef of schema.sheets) {
        const sheet = workbook.getWorksheet(sheetDef.name);
        if (!sheet) continue;

        for (const range of sheetDef.namedRanges) {
          const data = ctx.job.params[range.dataKey];
          // CellMatrix is ExcelJS's internal type — cast to access rows/cols safely
          const defined = workbook.definedNames.getMatrix(
            range.name,
          ) as unknown as Array<Array<{ row: number; col: number }>>;
          if (!defined || !data) continue;

          const firstRow = defined[0];
          const firstCell = firstRow?.[0];

          if (Array.isArray(data)) {
            data.forEach((row: unknown, rowIdx: number) => {
              if (typeof row !== 'object' || row === null) return;
              const rowData = row as Record<string, unknown>;
              const keys = Object.keys(rowData);
              keys.forEach((key, colIdx) => {
                const cell = sheet.getCell(
                  (firstCell?.row ?? 1) + rowIdx,
                  (firstCell?.col ?? 1) + colIdx,
                );
                cell.value = rowData[key] as ExcelJS.CellValue;
              });
            });
          } else {
            if (firstCell) {
              sheet.getCell(firstCell.row, firstCell.col).value =
                data as ExcelJS.CellValue;
            }
          }
        }
      }

      mkdirSync(dirname(ctx.outputPath), { recursive: true });
      await workbook.xlsx.writeFile(ctx.outputPath);

      const { size } = statSync(ctx.outputPath);
      return {
        outputPath: ctx.outputPath,
        sizeBytes: size,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.constructor.name === 'EngineError')
        throw err;
      throw new EngineError('XlsxEngine', err);
    }
  }
}
