import { ReportJob } from './job.types';
import { ReportTemplate } from './template.types';

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
