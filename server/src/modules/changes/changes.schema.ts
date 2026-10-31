import { z } from "zod";
import { ChangeStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

const jsonValue: z.ZodType<Prisma.JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);
const jsonObject = z
  .record(z.string(), jsonValue)
  .transform((value) => value as Prisma.InputJsonObject);

const day = z.string().trim().min(1);
const period = z.number().int().positive();
const reason = z.string().trim().min(1).max(2_000);

const facultyUnavailable = z
  .object({
    type: z.literal("faculty_unavailable"),
    faculty_id: z.string().trim().min(1),
    days: z.array(day).min(1),
    periods: z.array(period).optional(),
    reason,
  })
  .passthrough();

const roomUnavailable = z
  .object({
    type: z.literal("room_unavailable"),
    room_id: z.string().trim().min(1),
    days: z.array(day).min(1),
    periods: z.array(period).optional(),
    reason,
  })
  .passthrough();

const addSession = z
  .object({
    type: z.literal("add_session"),
    session: jsonObject,
  })
  .passthrough();

const addFaculty = z
  .object({
    type: z.literal("add_faculty"),
    faculty: jsonObject,
  })
  .passthrough();

const removeSession = z
  .object({
    type: z.literal("remove_session"),
    session_id: z.string().trim().min(1),
  })
  .passthrough();

export const disruptionSchema = z
  .object({
    changes: z
      .array(
        z.discriminatedUnion("type", [
          facultyUnavailable,
          roomUnavailable,
          addSession,
          addFaculty,
          removeSession,
        ]),
      )
      .min(1),
  })
  .passthrough();

export const changeIdParamsSchema = z
  .object({ id: z.string().trim().min(1) })
  .strict();

export const changeListQuerySchema = z
  .object({
    status: z
      .string()
      .transform((value) => value.split(",").map((item) => item.trim()))
      .pipe(z.array(z.nativeEnum(ChangeStatus)).min(1))
      .optional(),
  })
  .strict();

export const changeRejectBodySchema = z.object({ note: reason }).strict();

export const facultyUnavailabilityBodySchema = z
  .object({
    days: z.array(day).min(1),
    periods: z.array(period).optional(),
    reason,
  })
  .strict();

export const changeRequestBodySchema = z
  .object({
    sessionId: z.string().trim().min(1),
    requestedChange: z.enum(["move", "extra"]),
    details: jsonObject,
    preferredDay: day.optional(),
    preferredPeriod: period.optional(),
  })
  .strict();

export const uploadChangeBodySchema = disruptionSchema;

export type Disruption = z.infer<typeof disruptionSchema>;
export type ChangeListQuery = z.infer<typeof changeListQuerySchema>;
export type FacultyUnavailabilityBody = z.infer<
  typeof facultyUnavailabilityBodySchema
>;
export type ChangeRequestBody = z.infer<typeof changeRequestBodySchema>;
