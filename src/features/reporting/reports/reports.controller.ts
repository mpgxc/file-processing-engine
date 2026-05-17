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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ReportsService } from './reports.service';
import { GenerateReportSchema } from './dto/generate-report.dto';
import { ValidationError } from '../../../commons/errors/app-errors';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Submit a report generation job' })
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'format',
        'templateId',
        'params',
        'recipientEmail',
        'recipientName',
      ],
      properties: {
        format: {
          type: 'string',
          enum: ['PDF', 'CSV', 'XLSX', 'TXT'],
          example: 'PDF',
        },
        templateId: { type: 'string', example: 'tpl_01JVBT' },
        params: {
          type: 'object',
          additionalProperties: true,
          example: { month: 'May', year: 2026 },
        },
        recipientEmail: {
          type: 'string',
          format: 'email',
          example: 'user@example.com',
        },
        recipientName: { type: 'string', example: 'João Silva' },
        locale: { type: 'string', default: 'pt-BR', example: 'pt-BR' },
      },
    },
  })
  @ApiResponse({
    status: 202,
    description: 'Job accepted — report is being generated',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', example: '01JVBT...' },
        status: { type: 'string', example: 'PENDING' },
        message: { type: 'string', example: 'Report queued' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Cache hit — report already done',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', example: '01JVBT...' },
        status: { type: 'string', example: 'DONE' },
        downloadUrl: { type: 'string', format: 'uri' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async generate(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const parsed = GenerateReportSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((e) => ({
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
  @ApiOperation({ summary: 'Get report job status' })
  @ApiParam({ name: 'jobId', description: 'ULID job identifier' })
  @ApiResponse({
    status: 200,
    description: 'Job status',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        status: {
          type: 'string',
          enum: ['PENDING', 'PROCESSING', 'DONE', 'FAILED'],
        },
        format: { type: 'string', enum: ['PDF', 'CSV', 'XLSX', 'TXT'] },
        downloadUrl: { type: 'string', format: 'uri' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getStatus(@Param('jobId') jobId: string) {
    return this.reportsService.getStatus(jobId);
  }
}
