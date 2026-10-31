import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import ApiError, {
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  ValidationError,
} from "../utils/api-error.js";

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  let apiError: ApiError;

  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof ZodError) {
    apiError = new ValidationError(
      "The request contains invalid fields.",
      "VALIDATION_ERROR",
      error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  } else if (
    error instanceof SyntaxError &&
    typeof error === "object" &&
    error !== null &&
    "body" in error
  ) {
    apiError = new BadRequestError("The request body contains malformed JSON.");
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      apiError = new ConflictError(
        "A record with the same value already exists.",
      );
    } else if (error.code === "P2025") {
      apiError = new NotFoundError("The requested record was not found.");
    } else {
      console.error("[UNHANDLED_PRISMA_ERROR]", error.stack ?? error);
      apiError = new InternalServerError("An unexpected error occurred.");
    }
  } else {
    console.error(
      "[UNHANDLED_ERROR]",
      error instanceof Error ? (error.stack ?? error) : error,
    );
    apiError = new InternalServerError("An unexpected error occurred.");
  }

  const body: {
    statusCode: number;
    success: false;
    message: string;
    code: string;
    details?: unknown;
  } = {
    statusCode: apiError.statusCode,
    success: false,
    message: apiError.message,
    code: apiError.code,
  };
  if (apiError.details !== undefined) body.details = apiError.details;

  res.status(apiError.statusCode).json(body);
};

export default errorHandler;
