import { z } from "zod";

const page = z.coerce.number().int().positive();
const weekdays = ["MON", "TUE", "WED", "THU", "FRI"] as const;

export const timetableListQuerySchema = z
  .object({
    page: page.default(1),
    limit: page.max(100).default(20),
  })
  .strict();

export const timetableIdParamsSchema = z
  .object({ id: z.string().min(1) })
  .strict();

export const groupParamsSchema = z
  .object({ groupId: z.string().min(1) })
  .strict();

export const facultyParamsSchema = z
  .object({ facultyId: z.string().min(1) })
  .strict();

export const roomParamsSchema = z
  .object({ roomId: z.string().min(1) })
  .strict();

const scheduleEntrySchema = z
  .object({
    session_id: z.string().min(1),
    day: z.enum(weekdays),
    start_period: z.number().int().positive(),
    room_id: z.string().min(1),
  })
  .strict();

export const manualValidationBodySchema = z
  .object({
    schedule: z
      .object({ sessions: z.array(scheduleEntrySchema) })
      .strict(),
  })
  .strict();

export const freeRoomsQuerySchema = z
  .object({
    day: z.enum(weekdays),
    period: z.coerce.number().int().positive(),
    capacity: z.coerce.number().int().nonnegative().optional(),
    type: z.string().trim().min(1).optional(),
  })
  .strict();

export type TimetableListQuery = z.infer<typeof timetableListQuerySchema>;
export type ManualValidationBody = z.infer<typeof manualValidationBodySchema>;
export type FreeRoomsQuery = z.infer<typeof freeRoomsQuerySchema>;
