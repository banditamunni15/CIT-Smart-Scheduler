import { Prisma } from "@prisma/client";
import { z } from "zod";
import { env } from "../../config/env.js";
import {
  ServiceUnavailableError,
  ValidationError,
} from "../../utils/api-error.js";

const jsonValueSchema: z.ZodType<Prisma.JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const examResultSchema = z.object({
  exams: z.array(z.record(z.string(), jsonValueSchema)),
  report: z
    .object({
      hard_violation_count: z.number().int().nonnegative(),
      soft_penalty: z.number().int(),
    })
    .catchall(jsonValueSchema),
});

const validationResultSchema = z.object({
  report: z
    .object({
      hard_violation_count: z.number().int().nonnegative(),
    })
    .catchall(jsonValueSchema),
});

const timetableResultSchema = z.object({
  schedule: z.object({
    dataset_id: z.string().optional(),
    sessions: z.array(
      z.object({
        session_id: z.string().min(1),
        day: z.string().min(1),
        start_period: z.number().int().positive(),
        room_id: z.string().min(1),
      }),
    ),
  }),
  report: z
    .object({
      hard_violation_count: z.number().int().nonnegative(),
    })
    .catchall(jsonValueSchema),
  soft_total: z.number(),
  soft_breakdown: z.record(z.string(), z.number()),
  solver_meta: jsonValueSchema.optional(),
});

const bookingDecisionResultSchema = z.object({
  decisions: z.array(z.record(z.string(), jsonValueSchema)),
  session_overrides: z.array(z.record(z.string(), jsonValueSchema)),
  report: z
    .object({
      hard_violation_count: z.number().int().nonnegative(),
    })
    .catchall(jsonValueSchema),
});

const bookingDraftCheckSchema = z.object({
  ok: z.boolean(),
  issues: z.array(jsonValueSchema),
  suggestion: z.record(z.string(), jsonValueSchema).nullable().optional(),
});

const repairResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("proposed"),
      schedule_after: z.record(z.string(), jsonValueSchema),
      diff: z.array(jsonValueSchema),
      moved_count: z.number().int().nonnegative().optional(),
      time_changed_count: z.number().int().nonnegative().optional(),
      room_only_count: z.number().int().nonnegative().optional(),
      report: z
        .object({ hard_violation_count: z.number().int().nonnegative() })
        .catchall(jsonValueSchema),
      applied_dataset: z.record(z.string(), jsonValueSchema).optional(),
    })
    .passthrough(),
  z
    .object({
      status: z.literal("impossible"),
      conflicts: jsonValueSchema,
      explanation: z.string().min(1),
    })
    .passthrough(),
]);

export type ExamGenerationResult = z.infer<typeof examResultSchema>;
export type DatasetValidationResult = z.infer<typeof validationResultSchema>;
export type TimetableGenerationResult = z.infer<typeof timetableResultSchema>;
export type BookingDecisionResult = z.infer<typeof bookingDecisionResultSchema>;
export type BookingDraftCheckResult = z.infer<typeof bookingDraftCheckSchema>;
export type RepairResult = z.infer<typeof repairResultSchema>;

export interface EngineClient {
  validate(dataset: Prisma.InputJsonObject): Promise<DatasetValidationResult>;
  validateSchedule(
    dataset: Prisma.InputJsonObject,
    schedule: Prisma.InputJsonObject,
    baseline?: Prisma.InputJsonObject,
  ): Promise<DatasetValidationResult>;
  generateTimetable(
    dataset: Prisma.InputJsonObject,
    timeLimit?: number,
  ): Promise<TimetableGenerationResult>;
  generateExams(
    dataset: Prisma.JsonValue,
    publishedTimetable?: Prisma.JsonValue,
  ): Promise<ExamGenerationResult>;
  checkBookingDraft(
    dataset: Prisma.InputJsonObject,
    publishedTimetable: Prisma.JsonValue,
    draft: Prisma.InputJsonObject,
  ): Promise<BookingDraftCheckResult>;
  decideBookings(
    dataset: Prisma.InputJsonObject,
    publishedTimetable: Prisma.JsonValue,
  ): Promise<BookingDecisionResult>;
  repair(
    dataset: Prisma.InputJsonObject,
    publishedTimetable: Prisma.JsonValue,
    disruption: Prisma.InputJsonObject,
    timeLimit: number,
  ): Promise<RepairResult>;
}

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasSessions = (value: unknown): value is { sessions: unknown[] } =>
  isJsonObject(value) && Array.isArray(Reflect.get(value, "sessions"));

const buildValidationSchedule = (dataset: Prisma.InputJsonObject): Record<string, unknown> => {
  const base = dataset.published_timetable;
  if (!hasSessions(base)) {
    throw new ValidationError("A published timetable is required when validating booking changes.", "ENGINE_INPUT_INVALID");
  }
  const bookingRequests = Array.isArray(dataset.booking_requests) ? dataset.booking_requests : [];
  const decisions: unknown[] = Array.isArray(dataset.booking_decisions) ? [...dataset.booking_decisions] : [];
  // Proposed manual/admin decisions replace any prior current decision for the same request.
  for (const request of bookingRequests) {
    if (!isJsonObject(request) || !isJsonObject(request.proposed_decision) || typeof request.id !== "string") continue;
    const proposed = request.proposed_decision;
    const existingIndex = decisions.findIndex((item) => isJsonObject(item) && item.request_id === request.id);
    const decision = {
      request_id: request.id,
      status: proposed.status,
      day: proposed.day ?? null,
      start_period: proposed.start_period ?? null,
      end_period: proposed.end_period ?? null,
      room_id: proposed.room_id ?? null,
      reason: proposed.reason ?? "",
    };
    if (existingIndex >= 0) decisions.splice(existingIndex, 1, decision);
    else decisions.push(decision);
  }
  const rawOverrides = Array.isArray(dataset.session_overrides) ? dataset.session_overrides : [];
  const sessionOverrides = rawOverrides.flatMap((item) => {
    if (!isJsonObject(item) || typeof item.session_id !== "string" || typeof item.request_id !== "string") return [];
    return [{
      session_id: item.session_id,
      day: item.to_day,
      start_period: item.to_start,
      room_id: item.to_room,
      displaced_by: item.request_id,
    }];
  });
  const schedule = Object.fromEntries(Object.entries(base));
  schedule.fest_week = { bookings: decisions, session_overrides: sessionOverrides };
  return schedule;
};

const scheduleSessions = (
  value: Prisma.JsonValue,
  dataset?: Prisma.InputJsonObject,
): Prisma.JsonValue[] => {
  if (!isJsonObject(value) || !Array.isArray(value.sessions)) {
    throw new ValidationError("The published timetable has no sessions array.", "ENGINE_INPUT_INVALID");
  }
  const overrides = dataset && Array.isArray(dataset.session_overrides)
    ? dataset.session_overrides.filter(isJsonObject)
    : [];
  const bySession = new Map(
    overrides
      .filter((item) => typeof item.session_id === "string" && typeof item.to_day === "string" && typeof item.to_start === "number" && typeof item.to_room === "string")
      .map((item) => [item.session_id as string, item] as const),
  );
  return (value.sessions as Prisma.JsonValue[]).map((entry) => {
    if (!isJsonObject(entry)) return entry;
    const override = bySession.get(String(entry.session_id));
    return override
      ? ({ ...entry, day: override.to_day as string, start_period: override.to_start as number, room_id: override.to_room as string } as Prisma.JsonValue)
      : entry;
  });
};

const parseResult = (value: unknown): ExamGenerationResult => {
  const raw = value as Record<string, unknown>;
  const report = typeof raw?.report === "object" && raw.report !== null
    ? { ...(raw.report as Record<string, unknown>), soft_penalty: (raw.report as Record<string, unknown>).soft_penalty ?? (raw.report as Record<string, unknown>).exam_soft_penalty ?? 0 }
    : raw?.report;
  const parsed = examResultSchema.safeParse({ ...raw, report });
  if (!parsed.success) {
    throw new ValidationError(
      "The engine returned an invalid exam schedule.",
      "ENGINE_OUTPUT_INVALID",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
};

const parseValidationResult = (value: unknown): DatasetValidationResult => {
  // The Python engine returns the validator report directly; older local fixtures
  // may wrap it in { report }. Normalize both forms at this boundary.
  const reportValue =
    typeof value === "object" && value !== null && "report" in value
      ? (value as { report: unknown }).report
      : value;
  const parsed = validationResultSchema.shape.report.safeParse(reportValue);
  if (!parsed.success) {
    throw new ValidationError(
      "The engine returned an invalid dataset validation report.",
      "ENGINE_OUTPUT_INVALID",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return { report: parsed.data };
};

const parseTimetableResult = (value: unknown): TimetableGenerationResult => {
  const raw = value as Record<string, unknown>;
  const normalized = raw && Array.isArray(raw.sessions)
    ? {
        schedule: {
          sessions: raw.sessions,
          ...(typeof raw.dataset_id === "string"
            ? { dataset_id: raw.dataset_id }
            : typeof raw.report === "object" && raw.report !== null && typeof (raw.report as Record<string, unknown>).dataset_id === "string"
              ? { dataset_id: (raw.report as Record<string, unknown>).dataset_id as string }
              : {}),
        },
        report: raw.report,
        soft_total: raw.soft_total ?? (typeof raw.report === "object" && raw.report !== null ? (raw.report as Record<string, unknown>).soft_total : undefined),
        soft_breakdown: raw.soft_penalties ?? (typeof raw.report === "object" && raw.report !== null ? (raw.report as Record<string, unknown>).soft_penalties : undefined),
        solver_meta: raw.solver ?? raw.solver_meta,
      }
    : raw;
  const parsed = timetableResultSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new ValidationError(
      "The engine returned an invalid timetable.",
      "ENGINE_OUTPUT_INVALID",
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return parsed.data;
};

const parseBookingDecisionResult = (value: unknown): BookingDecisionResult => {
  const raw = value as Record<string, unknown>;
  const festWeek = raw && typeof raw.fest_week === "object" && raw.fest_week !== null
    ? (raw.fest_week as Record<string, unknown>) : undefined;
  const bookings = festWeek?.bookings;
  const normalized = festWeek && Array.isArray(bookings)
    ? {
        decisions: bookings.map((item) => {
          if (typeof item !== "object" || item === null) return item;
          const decision = item as Record<string, unknown>;
          const status = typeof decision.status === "string" ? decision.status.toUpperCase() : decision.status;
          return { ...decision, status: status === "ALTERNATIVE_OFFERED" ? "ALTERNATIVE_OFFERED" : status };
        }),
        session_overrides: Array.isArray(festWeek.session_overrides) ? festWeek.session_overrides : [],
        report: raw.report,
      }
    : raw;
  const parsed = bookingDecisionResultSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new ValidationError(
      "The engine returned an invalid booking decision response.",
      "ENGINE_OUTPUT_INVALID",
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return parsed.data;
};

const parseBookingDraftCheck = (value: unknown): BookingDraftCheckResult => {
  const parsed = bookingDraftCheckSchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      "The engine returned an invalid booking draft check response.",
      "ENGINE_OUTPUT_INVALID",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
};

const parseRepairResult = (value: unknown): RepairResult => {
  const parsed = repairResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      "The engine returned an invalid timetable repair response.",
      "ENGINE_OUTPUT_INVALID",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
};

export class RealEngine implements EngineClient {
  async validate(
    dataset: Prisma.InputJsonObject,
  ): Promise<DatasetValidationResult> {
    const schedule = buildValidationSchedule(dataset);
    return parseValidationResult(await this.post("validate", { dataset, schedule }));
  }

  async validateSchedule(
    dataset: Prisma.InputJsonObject,
    schedule: Prisma.InputJsonObject,
    baseline?: Prisma.InputJsonObject,
  ): Promise<DatasetValidationResult> {
    return parseValidationResult(
      await this.post("validate", { dataset, schedule, ...(baseline ? { baseline } : {}) }),
    );
  }

  async generateTimetable(
    dataset: Prisma.InputJsonObject,
    timeLimit = 20,
  ): Promise<TimetableGenerationResult> {
    return parseTimetableResult(
      await this.post(
        "timetable/generate",
        { dataset, time_limit_s: timeLimit },
        Math.max(env.ENGINE_TIMEOUT_MS, timeLimit * 1000 + 10_000),
      ),
    );
  }

  async generateExams(
    dataset: Prisma.JsonValue,
    publishedTimetable?: Prisma.JsonValue,
  ): Promise<ExamGenerationResult> {
    return parseResult(
      await this.post("exams/generate", {
        dataset,
        ...(isJsonObject(publishedTimetable) && Array.isArray(publishedTimetable.sessions)
          ? { sessions: publishedTimetable.sessions }
          : {}),
      }),
    );
  }

  async checkBookingDraft(
    dataset: Prisma.InputJsonObject,
    publishedTimetable: Prisma.JsonValue,
    draft: Prisma.InputJsonObject,
  ): Promise<BookingDraftCheckResult> {
    return parseBookingDraftCheck(
      await this.post("bookings/check-draft", {
        dataset,
        sessions: scheduleSessions(publishedTimetable, dataset),
        draft,
        existing_bookings: isJsonObject(dataset) && Array.isArray(dataset.booking_decisions)
          ? dataset.booking_decisions
          : [],
      }),
    );
  }

  async decideBookings(
    dataset: Prisma.InputJsonObject,
    publishedTimetable: Prisma.JsonValue,
  ): Promise<BookingDecisionResult> {
    return parseBookingDecisionResult(
      await this.post("bookings/decide", {
        dataset,
        sessions: scheduleSessions(publishedTimetable),
      }),
    );
  }

  async repair(
    dataset: Prisma.InputJsonObject,
    publishedTimetable: Prisma.JsonValue,
    disruption: Prisma.InputJsonObject,
    timeLimit: number,
  ): Promise<RepairResult> {
    return parseRepairResult(
      await this.post("repair", {
        dataset,
        baseline: publishedTimetable,
        disruption,
        time_limit_s: timeLimit,
      }),
    );
  }

  private async post(
    path: string,
    body: unknown,
    timeoutMs = env.ENGINE_TIMEOUT_MS,
  ): Promise<unknown> {
    if (!env.ENGINE_URL) {
      throw new ServiceUnavailableError(
        "The scheduling engine is not configured.",
        "ENGINE_UNAVAILABLE",
      );
    }

    let response: Response;
    try {
      const baseUrl = env.ENGINE_URL.endsWith("/")
        ? env.ENGINE_URL
        : `${env.ENGINE_URL}/`;
      response = await fetch(new URL(path, baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ServiceUnavailableError(
        "The scheduling engine could not be reached.",
        "ENGINE_UNAVAILABLE",
        error instanceof Error ? error.message : undefined,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ServiceUnavailableError(
        "The scheduling engine returned an invalid response.",
        "ENGINE_UNAVAILABLE",
      );
    }

    if (response.status === 404 || response.status === 405 || response.status >= 500) {
      throw new ServiceUnavailableError(
        response.status >= 500
          ? "The scheduling engine is unavailable."
          : "The scheduling engine API contract is incompatible with this server.",
        response.status >= 500 ? "ENGINE_UNAVAILABLE" : "ENGINE_API_MISMATCH",
        payload,
      );
    }

    if (response.status === 422 || response.status === 400) {
      throw new ValidationError(
        "The scheduling engine rejected the request or could not satisfy its constraints.",
        "ENGINE_REQUEST_REJECTED",
        payload,
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableError(
        "The scheduling engine is unavailable.",
        "ENGINE_UNAVAILABLE",
      );
    }

    return payload;
  }
}

export class MockEngine implements EngineClient {
  constructor(
    private readonly examFixture?:
      | ExamGenerationResult
      | (() => ExamGenerationResult | Promise<ExamGenerationResult>),
    private readonly validationFixture?:
      | DatasetValidationResult
      | (() => DatasetValidationResult | Promise<DatasetValidationResult>),
    private readonly timetableFixture?:
      | TimetableGenerationResult
      | (() => TimetableGenerationResult | Promise<TimetableGenerationResult>),
    private readonly bookingDraftFixture?:
      | BookingDraftCheckResult
      | (() => BookingDraftCheckResult | Promise<BookingDraftCheckResult>),
    private readonly bookingDecisionsFixture?:
      | BookingDecisionResult
      | (() => BookingDecisionResult | Promise<BookingDecisionResult>),
    private readonly repairFixture?:
      | RepairResult
      | (() => RepairResult | Promise<RepairResult>),
  ) {}

  async validate(): Promise<DatasetValidationResult> {
    if (!this.validationFixture) {
      throw new ServiceUnavailableError(
        "No mock dataset-validation fixture has been configured.",
        "ENGINE_UNAVAILABLE",
      );
    }

    const result =
      typeof this.validationFixture === "function"
        ? await this.validationFixture()
        : this.validationFixture;
    return parseValidationResult(result);
  }

  async validateSchedule(): Promise<DatasetValidationResult> {
    return this.validate();
  }

  async generateTimetable(): Promise<TimetableGenerationResult> {
    if (!this.timetableFixture) {
      throw new ServiceUnavailableError(
        "No mock timetable-generation fixture has been configured.",
        "ENGINE_UNAVAILABLE",
      );
    }

    const result =
      typeof this.timetableFixture === "function"
        ? await this.timetableFixture()
        : this.timetableFixture;
    return parseTimetableResult(result);
  }

  async generateExams(): Promise<ExamGenerationResult> {
    if (!this.examFixture) {
      throw new ServiceUnavailableError(
        "No mock exam-generation fixture has been configured.",
        "ENGINE_UNAVAILABLE",
      );
    }

    const result =
      typeof this.examFixture === "function"
        ? await this.examFixture()
        : this.examFixture;
    return parseResult(result);
  }

  async checkBookingDraft(): Promise<BookingDraftCheckResult> {
    if (!this.bookingDraftFixture) {
      throw new ServiceUnavailableError(
        "No mock booking-draft fixture has been configured.",
        "ENGINE_UNAVAILABLE",
      );
    }
    const result =
      typeof this.bookingDraftFixture === "function"
        ? await this.bookingDraftFixture()
        : this.bookingDraftFixture;
    return parseBookingDraftCheck(result);
  }

  async decideBookings(): Promise<BookingDecisionResult> {
    if (!this.bookingDecisionsFixture) {
      throw new ServiceUnavailableError(
        "No mock booking-decision fixture has been configured.",
        "ENGINE_UNAVAILABLE",
      );
    }
    const result =
      typeof this.bookingDecisionsFixture === "function"
        ? await this.bookingDecisionsFixture()
        : this.bookingDecisionsFixture;
    return parseBookingDecisionResult(result);
  }

  async repair(): Promise<RepairResult> {
    if (!this.repairFixture) {
      throw new ServiceUnavailableError(
        "No mock timetable-repair fixture has been configured.",
        "ENGINE_UNAVAILABLE",
      );
    }
    const result =
      typeof this.repairFixture === "function"
        ? await this.repairFixture()
        : this.repairFixture;
    return parseRepairResult(result);
  }
}

export const createEngine = (): EngineClient => {
  if (env.ENGINE_MODE !== "mock") return new RealEngine();

  return new MockEngine(
    () => {
      if (!env.ENGINE_MOCK_EXAM_RESULT) {
        throw new ServiceUnavailableError(
          "ENGINE_MODE=mock requires ENGINE_MOCK_EXAM_RESULT.",
          "ENGINE_UNAVAILABLE",
        );
      }

      let fixture: unknown;
      try {
        fixture = JSON.parse(env.ENGINE_MOCK_EXAM_RESULT);
      } catch {
        throw new ValidationError(
          "ENGINE_MOCK_EXAM_RESULT must contain valid JSON.",
          "ENGINE_OUTPUT_INVALID",
        );
      }
      return parseResult(fixture);
    },
    () => {
      const rawFixture = env.ENGINE_MOCK_VALIDATION_RESULT;
      if (!rawFixture) {
        throw new ServiceUnavailableError(
          "ENGINE_MODE=mock requires ENGINE_MOCK_VALIDATION_RESULT.",
          "ENGINE_UNAVAILABLE",
        );
      }

      let fixture: unknown;
      try {
        fixture = JSON.parse(rawFixture);
      } catch {
        throw new ValidationError(
          "ENGINE_MOCK_VALIDATION_RESULT must contain valid JSON.",
          "ENGINE_OUTPUT_INVALID",
        );
      }
      return parseValidationResult(fixture);
    },
    () => {
      const rawFixture = env.ENGINE_MOCK_TIMETABLE_RESULT;
      if (!rawFixture) {
        throw new ServiceUnavailableError(
          "ENGINE_MODE=mock requires ENGINE_MOCK_TIMETABLE_RESULT.",
          "ENGINE_UNAVAILABLE",
        );
      }

      let fixture: unknown;
      try {
        fixture = JSON.parse(rawFixture);
      } catch {
        throw new ValidationError(
          "ENGINE_MOCK_TIMETABLE_RESULT must contain valid JSON.",
          "ENGINE_OUTPUT_INVALID",
        );
      }
      return parseTimetableResult(fixture);
    },
    () => {
      const rawFixture = env.ENGINE_MOCK_BOOKING_DRAFT_RESULT;
      if (!rawFixture) {
        throw new ServiceUnavailableError(
          "ENGINE_MODE=mock requires ENGINE_MOCK_BOOKING_DRAFT_RESULT.",
          "ENGINE_UNAVAILABLE",
        );
      }
      let fixture: unknown;
      try {
        fixture = JSON.parse(rawFixture);
      } catch {
        throw new ValidationError(
          "ENGINE_MOCK_BOOKING_DRAFT_RESULT must contain valid JSON.",
          "ENGINE_OUTPUT_INVALID",
        );
      }
      return parseBookingDraftCheck(fixture);
    },
    () => {
      const rawFixture = env.ENGINE_MOCK_BOOKING_DECISIONS_RESULT;
      if (!rawFixture) {
        throw new ServiceUnavailableError(
          "ENGINE_MODE=mock requires ENGINE_MOCK_BOOKING_DECISIONS_RESULT.",
          "ENGINE_UNAVAILABLE",
        );
      }
      let fixture: unknown;
      try {
        fixture = JSON.parse(rawFixture);
      } catch {
        throw new ValidationError(
          "ENGINE_MOCK_BOOKING_DECISIONS_RESULT must contain valid JSON.",
          "ENGINE_OUTPUT_INVALID",
        );
      }
      return parseBookingDecisionResult(fixture);
    },
    () => {
      const rawFixture = env.ENGINE_MOCK_REPAIR_RESULT;
      if (!rawFixture) {
        throw new ServiceUnavailableError(
          "ENGINE_MODE=mock requires ENGINE_MOCK_REPAIR_RESULT.",
          "ENGINE_UNAVAILABLE",
        );
      }
      let fixture: unknown;
      try {
        fixture = JSON.parse(rawFixture);
      } catch {
        throw new ValidationError(
          "ENGINE_MOCK_REPAIR_RESULT must contain valid JSON.",
          "ENGINE_OUTPUT_INVALID",
        );
      }
      return parseRepairResult(fixture);
    },
  );
};
