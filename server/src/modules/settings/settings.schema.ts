import { z } from "zod";

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

export type PriorityOrderBody = z.infer<typeof priorityOrderBodySchema>;
