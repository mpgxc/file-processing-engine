import { ReportFormat } from './job.types.js';

export interface ReportJobMessage {
  jobId: string;
  format: ReportFormat;
  dedupHash: string;
}
