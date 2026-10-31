import { z } from "zod";

const pageNumber = z.coerce.number().int().positive();

export const listExamsQuerySchema = z
  .object({
    page: pageNumber.default(1),
    limit: pageNumber.max(100).default(20),
  })
  .strict();

export const examIdParamsSchema = z.object({ id: z.string().min(1) }).strict();

export const examGroupParamsSchema = z
  .object({ groupId: z.string().min(1) })
  .strict();

export type ListExamsQuery = z.infer<typeof listExamsQuerySchema>;
