import { JobStatus, ReportFormat } from './job.types.js';

export interface GenerateReportRequest {
  format: ReportFormat;
  templateId: string;
  params: Record<string, unknown>;
  recipientEmail: string;
  recipientName: string;
  locale?: string;
}

export interface GenerateReportResponse {
  jobId: string;
  status: JobStatus;
  message: string;
}

export interface GenerateReportCacheHit {
  jobId: string;
  status: 'DONE';
  downloadUrl: string;
  expiresAt: string;
}

export interface JobStatusResponse {
  jobId: string;
  status: JobStatus;
  downloadUrl?: string;
  format: ReportFormat;
  createdAt: string;
}
