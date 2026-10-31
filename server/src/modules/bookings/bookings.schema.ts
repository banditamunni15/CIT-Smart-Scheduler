import { BookingCategory, DecisionStatus, RequestStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

const jsonValue: z.ZodType<Prisma.InputJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

const windowSchema = z
  .object({
    day: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
    from_period: z.number().int().positive(),
    to_period: z.number().int().positive(),
  })
  .refine((value) => value.to_period >= value.from_period, {
    path: ["to_period"],
    message: "to_period must be on or after from_period.",
  });

const mutableFields = {
  title: z.string().trim().min(1).max(200),
  attendance: z.number().int().positive(),
  durationPeriods: z.number().int().positive(),
  windows: z.array(windowSchema).min(1),
  roomTypes: z.array(z.string().trim().min(1)),
  needs: z.array(z.string().trim().min(1)),
  requestedRoom: z.string().trim().min(1).optional(),
  mandatoryForGroups: z.array(z.string().trim().min(1)),
  seriesId: z.string().trim().min(1).optional(),
  requestedCategory: z.nativeEnum(BookingCategory),
  rawText: z.string().max(20_000).optional(),
  llmDraft: z.record(z.string(), jsonValue).optional(),
};

export const bookingBodySchema = z.object(mutableFields).strict();

export const bookingPatchBodySchema = z
  .object({
    ...mutableFields,
    requestedCategory: mutableFields.requestedCategory.optional(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const bookingIdParamsSchema = z
  .object({ id: z.string().min(1) })
  .strict();

export const bookingSeriesParamsSchema = z
  .object({ seriesId: z.string().min(1) })
  .strict();

export const bookingListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.nativeEnum(RequestStatus).optional(),
    category: z.nativeEnum(BookingCategory).optional(),
    seriesId: z.string().trim().min(1).optional(),
    q: z.string().trim().min(1).optional(),
  })
  .strict();

export const bookingCancelBodySchema = z
  .object({ note: z.string().trim().min(1).max(2_000) })
  .strict();

export const bookingDecisionBodySchema = z
  .object({
    status: z.nativeEnum(DecisionStatus),
    day: z.string().trim().min(1).optional(),
    startPeriod: z.number().int().positive().optional(),
    endPeriod: z.number().int().positive().optional(),
    roomId: z.string().trim().min(1).optional(),
    reason: z.string().trim().max(2_000).optional(),
  })
  .strict();

export const bookingOverrideBodySchema = z
  .object({
    status: z.nativeEnum(DecisionStatus),
    day: z.string().trim().min(1),
    startPeriod: z.number().int().positive(),
    endPeriod: z.number().int().positive(),
    roomId: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict()
  .refine((value) => value.endPeriod >= value.startPeriod, {
    path: ["endPeriod"],
    message: "endPeriod must be on or after startPeriod.",
  });

export const bookingReviewBodySchema = z
  .object({ reason: z.string().trim().min(1).max(2_000) })
  .strict();

export const bookingManualBodySchema = z
  .object({
    ...mutableFields,
    day: z.string().trim().min(1),
    startPeriod: z.number().int().positive(),
    endPeriod: z.number().int().positive(),
    roomId: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict()
  .refine((value) => value.endPeriod >= value.startPeriod, {
    path: ["endPeriod"],
    message: "endPeriod must be on or after startPeriod.",
  });

export type BookingBody = z.infer<typeof bookingBodySchema>;
export type BookingPatchBody = z.infer<typeof bookingPatchBodySchema>;
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;
export type BookingDecisionBody = z.infer<typeof bookingDecisionBodySchema>;
export type BookingOverrideBody = z.infer<typeof bookingOverrideBodySchema>;
export type BookingManualBody = z.infer<typeof bookingManualBodySchema>;
