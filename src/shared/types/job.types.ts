export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

export enum ReportFormat {
  PDF = 'PDF',
  CSV = 'CSV',
  XLSX = 'XLSX',
  TXT = 'TXT',
}

export interface ReportJob {
  jobId: string;
  tenantId: string;
  userId: string;
  format: ReportFormat;
  templateId: string;
  templateVersion: string;
  params: Record<string, unknown>;
  paramsHash: string;
  dedupHash: string;
  status: JobStatus;
  s3OutputKey?: string;
  errorMessage?: string;
  recipientEmail: string;
  recipientName: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: number;
}
