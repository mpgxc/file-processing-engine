import { z } from 'zod';
import { ReportFormat } from '../../../../commons/types/job.types.js';

export const GenerateReportSchema = z.object({
  format: z.nativeEnum(ReportFormat),
  templateId: z.string().min(1),
  params: z.record(z.unknown()),
  recipientEmail: z.string().email(),
  recipientName: z.string().min(1),
  locale: z.string().optional().default('pt-BR'),
});

export type GenerateReportDto = z.infer<typeof GenerateReportSchema>;
