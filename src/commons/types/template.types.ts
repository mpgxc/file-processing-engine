import { ReportFormat } from './job.types.js';

export interface ReportTemplate {
  templateId: string;
  version: string;
  format: ReportFormat;
  name: string;
  description?: string;
  s3Key: string;
  mailTemplateId: string;
  // Keep 'global' as an explicit suggested literal while still accepting tenant-specific ids.
  tenantId: 'global' | (string & {});
  isActive: boolean;
  createdAt: string;
}
