import { Injectable } from '@nestjs/common';
import { IReportEngine } from './engine.interface.js';
import { ReportFormat } from '../../commons/types/job.types.js';
import { EngineError } from '../../commons/errors/app-errors.js';

@Injectable()
export class EngineRegistry {
  private readonly engines = new Map<ReportFormat, IReportEngine>();

  register(engine: IReportEngine): void {
    this.engines.set(engine.format, engine);
  }

  resolve(format: ReportFormat): IReportEngine {
    const engine = this.engines.get(format);
    if (!engine) {
      throw new EngineError(
        'EngineRegistry',
        new Error(`No engine registered for format ${format}`),
      );
    }
    return engine;
  }
}
