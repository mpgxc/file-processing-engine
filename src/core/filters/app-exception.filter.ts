import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { AppError, ValidationError } from '../../commons/errors/app-errors';

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (response.headersSent) return;

    if (exception instanceof ValidationError) {
      response.status(400).json({
        errorCode: exception.errorCode,
        message: exception.message,
        errors: exception.fieldErrors,
      });
      return;
    }

    if (exception instanceof AppError) {
      response.status(exception.statusCode).json({
        errorCode: exception.errorCode,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    response.status(500).json({
      errorCode: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}
