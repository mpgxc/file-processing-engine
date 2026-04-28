export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class JobNotFoundError extends AppError {
  constructor(jobId: string) {
    super(404, 'JOB_NOT_FOUND', `Job ${jobId} not found`);
  }
}

export class TemplateNotFoundError extends AppError {
  constructor(templateId: string) {
    super(404, 'TEMPLATE_NOT_FOUND', `Template ${templateId} not found`);
  }
}

export class DedupHashConflictError extends AppError {
  constructor(dedupHash: string) {
    super(
      409,
      'DEDUP_HASH_CONFLICT',
      `Job with dedupHash ${dedupHash} is already being processed`,
    );
  }
}

export interface FieldError {
  field: string;
  message: string;
}

export class ValidationError extends AppError {
  constructor(public readonly fieldErrors: FieldError[]) {
    super(400, 'VALIDATION_ERROR', 'Request validation failed');
  }
}

export class EngineError extends AppError {
  constructor(
    public readonly engineName: string,
    public readonly originalError: unknown,
  ) {
    const msg =
      originalError instanceof Error
        ? originalError.message
        : String(originalError);
    super(500, 'ENGINE_ERROR', `Engine ${engineName} failed: ${msg}`);
  }
}

export class MountNotAvailableError extends AppError {
  constructor(mountPath: string) {
    super(
      500,
      'MOUNT_NOT_AVAILABLE',
      `S3 Files mount not available at ${mountPath}`,
    );
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}
