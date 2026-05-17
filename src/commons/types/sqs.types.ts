import { ReportFormat } from './job.types';

export interface ReportJobMessage {
  jobId: string;
  format: ReportFormat;
  dedupHash: string;
}
