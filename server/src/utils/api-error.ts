class ApiError extends Error {
  statusCode: number;
  success: boolean;
  message: string;
  code: string;
  details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    code: string,
    details?: unknown,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.success = false;
    this.message = message;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string, code = "BAD_REQUEST", details?: unknown) {
    super(400, message, code, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string, code = "UNAUTHORIZED", details?: unknown) {
    super(401, message, code, details);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string, code = "FORBIDDEN", details?: unknown) {
    super(403, message, code, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string, code = "NOT_FOUND", details?: unknown) {
    super(404, message, code, details);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, code = "CONFLICT", details?: unknown) {
    super(409, message, code, details);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, code = "VALIDATION_ERROR", details?: unknown) {
    super(422, message, code, details);
  }
}

export class TooManyRequestsError extends ApiError {
  constructor(message: string, code = "TOO_MANY_REQUESTS", details?: unknown) {
    super(429, message, code, details);
  }
}

export class InternalServerError extends ApiError {
  constructor(
    message: string,
    code = "INTERNAL_SERVER_ERROR",
    details?: unknown,
  ) {
    super(500, message, code, details);
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(
    message: string,
    code = "SERVICE_UNAVAILABLE",
    details?: unknown,
  ) {
    super(503, message, code, details);
  }
}
export default ApiError;
