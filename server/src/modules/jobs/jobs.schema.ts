import { z } from "zod";

const page = z.coerce.number().int().positive();

export const jobsListQuerySchema = z
  .object({
    page: page.default(1),
    limit: page.max(100).default(20),
  })
  .strict();

export const jobIdParamsSchema = z
  .object({ id: z.string().min(1) })
  .strict();

export type JobsListQuery = z.infer<typeof jobsListQuerySchema>;
