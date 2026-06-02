import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

/** Formats every error response as the standard { data, error, meta } envelope. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let error: { code: number; message: string; details?: unknown };

    if (exception instanceof HttpException) {
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        error = { code: status, message: resp };
      } else {
        const r = resp as Record<string, unknown>;
        error = {
          code: status,
          message: (r.message as string) ?? exception.message,
          details: r.issues ?? r.details,
        };
      }
    } else {
      this.logger.error(exception);
      error = { code: status, message: 'Internal server error' };
    }

    res.status(status).json({ data: null, error, meta: null });
  }
}
