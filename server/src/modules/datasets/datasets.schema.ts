import { z } from "zod";
import { Prisma } from "@prisma/client";

const pageNumber = z.coerce.number().int().positive();
const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

export const datasetListQuerySchema = z
  .object({
    page: pageNumber.default(1),
    limit: pageNumber.max(100).default(20),
  })
  .strict();

export const datasetUploadBodySchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    data: z
      .record(z.string(), jsonValue)
      .transform((value) => value as Prisma.InputJsonObject)
      .refine(
        (value) =>
          typeof value.dataset_id === "string" &&
          value.dataset_id.trim().length > 0,
        "data.dataset_id must be a non-empty string.",
      ),
  })
  .strict();

export const datasetIdParamsSchema = z
  .object({ id: z.string().min(1) })
  .strict();

export const priorityOrderBodySchema = z
  .object({
    priority_order: z
      .array(z.string().trim().min(1))
      .min(1)
      .refine((values) => new Set(values).size === values.length, {
        message: "Priority values must be unique.",
      }),
  })
  .strict();

export type DatasetListQuery = z.infer<typeof datasetListQuerySchema>;
export type DatasetUploadBody = z.infer<typeof datasetUploadBodySchema>;
export type PriorityOrderBody = z.infer<typeof priorityOrderBodySchema>;
