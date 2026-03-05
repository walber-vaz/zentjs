import { HttpStatus, HttpStatusText } from '../utils/http-status';

export class HttpError extends Error {
  static showStackTrace = false;
  statusCode: number;
  error: string;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.error = HttpStatusText[statusCode] || 'Unknown Error';
    this.name = this.constructor.name;

    if (HttpError.showStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = undefined;
    }
  }

  toJSON() {
    const payload: Record<string, unknown> = {
      statusCode: this.statusCode,
      error: this.error,
      message: this.message,
    };

    if (HttpError.showStackTrace && this.stack) {
      payload.stack = this.stack;
    }

    return payload;
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad Request') {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(HttpStatus.UNAUTHORIZED, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(HttpStatus.FORBIDDEN, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not Found') {
    super(HttpStatus.NOT_FOUND, message);
  }
}

export class MethodNotAllowedError extends HttpError {
  allowedMethods?: string[];
  constructor(message = 'Method Not Allowed') {
    super(HttpStatus.METHOD_NOT_ALLOWED, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflict') {
    super(HttpStatus.CONFLICT, message);
  }
}

export class UnprocessableEntityError extends HttpError {
  constructor(message = 'Unprocessable Entity') {
    super(HttpStatus.UNPROCESSABLE_ENTITY, message);
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message = 'Too Many Requests') {
    super(HttpStatus.TOO_MANY_REQUESTS, message);
  }
}

export class InternalServerError extends HttpError {
  constructor(message = 'Internal Server Error') {
    super(HttpStatus.INTERNAL_SERVER_ERROR, message);
  }
}
