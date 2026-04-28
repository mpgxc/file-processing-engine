import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ReportsService } from './reports.service.js';
import { GenerateReportSchema } from './dto/generate-report.dto.js';
import { ValidationError } from '../shared/errors/app-errors.js';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('generate')
  async generate(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const parsed = GenerateReportSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      );
    }

    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const userId = (req as unknown as { userId: string }).userId;
    const result = await this.reportsService.generate(
      parsed.data,
      tenantId,
      userId,
    );

    if ('downloadUrl' in result) {
      res.status(HttpStatus.OK).json(result);
    } else {
      res.status(HttpStatus.ACCEPTED).json(result);
    }
  }

  @Get(':jobId/status')
  async getStatus(@Param('jobId') jobId: string) {
    return this.reportsService.getStatus(jobId);
  }
}
