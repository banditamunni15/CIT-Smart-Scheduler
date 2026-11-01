import { z } from "zod";

export const assistantChatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(8)
    .refine((messages) => messages.at(-1)?.role === "user", {
      message: "The last message must be from the user.",
    }),
});

export type AssistantChatBody = z.infer<typeof assistantChatBodySchema>;
