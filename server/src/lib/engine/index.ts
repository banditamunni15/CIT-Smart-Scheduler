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
  ): Promise<DatasetValidationResult>;
  generateTimetable(
    dataset: Prisma.InputJsonObject,
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

const parseResult = (value: unknown): ExamGenerationResult => {
  const parsed = examResultSchema.safeParse(value);
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
  const parsed = validationResultSchema.safeParse(value);
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
  return parsed.data;
};

const parseTimetableResult = (value: unknown): TimetableGenerationResult => {
  const parsed = timetableResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      "The engine returned an invalid timetable.",
      "ENGINE_OUTPUT_INVALID",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
};

const parseBookingDecisionResult = (value: unknown): BookingDecisionResult => {
  const parsed = bookingDecisionResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      "The engine returned an invalid booking decision response.",
      "ENGINE_OUTPUT_INVALID",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
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
    return parseValidationResult(await this.post("validate", { dataset }));
  }

  async validateSchedule(
    dataset: Prisma.InputJsonObject,
    schedule: Prisma.InputJsonObject,
  ): Promise<DatasetValidationResult> {
    return parseValidationResult(
      await this.post("validate", { dataset, schedule }),
    );
  }

  async generateTimetable(
    dataset: Prisma.InputJsonObject,
  ): Promise<TimetableGenerationResult> {
    return parseTimetableResult(
      await this.post("generate-timetable", { dataset }),
    );
  }

  async generateExams(
    dataset: Prisma.JsonValue,
    publishedTimetable?: Prisma.JsonValue,
  ): Promise<ExamGenerationResult> {
    return parseResult(
      await this.post("generate-exams", {
        dataset,
        published_timetable: publishedTimetable,
      }),
    );
  }

  async checkBookingDraft(
    dataset: Prisma.InputJsonObject,
    publishedTimetable: Prisma.JsonValue,
    draft: Prisma.InputJsonObject,
  ): Promise<BookingDraftCheckResult> {
    return parseBookingDraftCheck(
      await this.post("check-booking-draft", {
        dataset,
        published_timetable: publishedTimetable,
        draft,
      }),
    );
  }

  async decideBookings(
    dataset: Prisma.InputJsonObject,
    publishedTimetable: Prisma.JsonValue,
  ): Promise<BookingDecisionResult> {
    return parseBookingDecisionResult(
      await this.post("decide-bookings", {
        dataset,
        published_timetable: publishedTimetable,
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
        published_timetable: publishedTimetable,
        disruption,
        time_limit: timeLimit,
      }),
    );
  }

  private async post(path: string, body: unknown): Promise<unknown> {
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
        signal: AbortSignal.timeout(env.ENGINE_TIMEOUT_MS),
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

    if (response.status >= 400 && response.status < 500) {
      const details =
        typeof payload === "object" && payload !== null && "details" in payload
          ? payload.details
          : payload;
      throw new ValidationError(
        "The scheduling engine rejected the request.",
        "SCHEDULE_RULE_VIOLATION",
        details,
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
