import type { RequestHandler, Response } from "express";
import { z } from "zod";
import { InternalServerError, ValidationError } from "../utils/api-error.js";

type RequestSchemas = {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
};

type RequestPart = keyof RequestSchemas;
type ValidatedLocals = { validated?: Partial<Record<RequestPart, unknown>> };

const validate =
  (schemas: RequestSchemas): RequestHandler =>
  (req, res, next) => {
    const validated: Partial<Record<RequestPart, unknown>> = {};
    for (const key of ["params", "query", "body"] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        next(
          new ValidationError(
            "The request contains invalid fields.",
            "VALIDATION_ERROR",
            result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          ),
        );
        return;
      }

      validated[key] = result.data;
    }

    res.locals.validated = validated;
    next();
  };

export const validatedData = <T>(
  res: Response<unknown, ValidatedLocals>,
  key: RequestPart,
): T => {
  const value = res.locals.validated?.[key];
  if (value === undefined) {
    throw new InternalServerError(
      `Validated ${key} input was not available to the controller.`,
    );
  }
  return value as T;
};

export default validate;
