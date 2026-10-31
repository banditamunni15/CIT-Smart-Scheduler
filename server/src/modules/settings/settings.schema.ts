import { BookingCategory } from "@prisma/client";
import { z } from "zod";

export const priorityOrderBodySchema = z
  .object({
    priority_order: z
      .array(z.nativeEnum(BookingCategory))
      .length(4)
      .refine((values) => new Set(values).size === 4, {
        message: "Priority order must contain each booking category exactly once.",
      }),
  })
  .strict();

export type PriorityOrderBody = z.infer<typeof priorityOrderBodySchema>;
