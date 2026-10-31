import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().default(5000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:3000"),
  ENGINE_MODE: z.enum(["real", "mock"]).default("real"),
  ENGINE_URL: z.string().url().optional(),
  ENGINE_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  ENGINE_MOCK_EXAM_RESULT: z.string().optional(),
  ENGINE_MOCK_VALIDATION_RESULT: z.string().optional(),
  ENGINE_MOCK_TIMETABLE_RESULT: z.string().optional(),
  ENGINE_MOCK_BOOKING_DRAFT_RESULT: z.string().optional(),
  ENGINE_MOCK_BOOKING_DECISIONS_RESULT: z.string().optional(),
  ENGINE_MOCK_REPAIR_RESULT: z.string().optional(),
});

export const env = envSchema.parse(process.env);
