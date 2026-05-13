import { ReportJob } from './job.types.js';
import { ReportTemplate } from './template.types.js';

export interface EngineContext {
  job: ReportJob;
  template: ReportTemplate;
  outputPath: string;
  templatePath: string;
}

export interface EngineResult {
  outputPath: string;
  sizeBytes: number;
  durationMs: number;
}
