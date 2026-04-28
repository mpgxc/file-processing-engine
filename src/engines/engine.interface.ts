import { EngineContext, EngineResult } from '../shared/types/engine.types.js';
import { ReportFormat } from '../shared/types/job.types.js';
import { ReportTemplate } from '../shared/types/template.types.js';
import { ReportJob } from '../shared/types/job.types.js';

export interface IReportEngine {
  readonly format: ReportFormat;
  generate(ctx: EngineContext): Promise<EngineResult>;
}

export function getExtension(
  format: ReportFormat,
): 'pdf' | 'csv' | 'xlsx' | 'txt' {
  const map: Record<ReportFormat, 'pdf' | 'csv' | 'xlsx' | 'txt'> = {
    [ReportFormat.PDF]: 'pdf',
    [ReportFormat.CSV]: 'csv',
    [ReportFormat.XLSX]: 'xlsx',
    [ReportFormat.TXT]: 'txt',
  };
  return map[format];
}

export function resolveTemplatePath(
  template: ReportTemplate,
  mountBase = '/mnt/templates',
): string {
  const ext = getExtension(template.format);
  return `${mountBase}/${template.format.toLowerCase()}/${template.templateId}/${template.version}.${ext}`;
}

export function resolveOutputPath(
  job: ReportJob,
  mountBase = '/mnt/outputs',
): string {
  const ext = getExtension(job.format);
  return `${mountBase}/${job.tenantId}/${job.userId}/${job.dedupHash}.${ext}`;
}
