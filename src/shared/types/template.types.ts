import { ReportFormat } from './job.types.js';

export interface ReportTemplate {
  templateId: string;
  version: string;
  format: ReportFormat;
  name: string;
  description?: string;
  s3Key: string;
  mailTemplateId: string;
  tenantId: string | 'global';
  isActive: boolean;
  createdAt: string;
}
