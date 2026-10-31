import { randomUUID } from "node:crypto";
import {
  ChangeSource,
  ChangeStatus,
  JobKind,
  Prisma,
  Role,
  type Job,
} from "@prisma/client";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../utils/api-error.js";
import { createEngine, type EngineClient } from "../../lib/engine/index.js";
import { prisma } from "../../lib/prisma.js";
import {
  JobService,
  jobService,
  type JobHandler,
} from "../../jobs/job.service.js";
import type { RequestUser } from "../../types/express.js";
import {
  ChangesRepository,
  changesRepository,
  type ChangeActor,
  type ChangeCreateInput,
} from "./changes.repository.js";
import type {
  ChangeListQuery,
  ChangeRequestBody,
  Disruption,
  FacultyUnavailabilityBody,
} from "./changes.schema.js";

type JsonRecord = Prisma.JsonObject;
type ChangeRecord = NonNullable<
  Awaited<ReturnType<ChangesRepository["findById"]>>
>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asObject = (value: Prisma.JsonValue): JsonRecord => {
  if (!isRecord(value)) {
    throw new ValidationError(
      "The dataset must be a JSON object.",
      "DATASET_INVALID",
    );
  }
  return value;
};

const toInputValue = (value: unknown): Prisma.InputJsonValue | null => {
  if (value === null) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(toInputValue);
  if (isRecord(value)) return toInputObject(value);
  throw new ValidationError("A JSON value is invalid.", "DATASET_INVALID");
};

const toInputObject = (value: unknown): Prisma.InputJsonObject => {
  if (!isRecord(value)) {
    throw new ValidationError("A JSON object is invalid.", "DATASET_INVALID");
  }
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (nested !== undefined) result[key] = toInputValue(nested);
  }
  return result as Prisma.InputJsonObject;
};

const fieldString = (record: JsonRecord, fields: string[]) => {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
};

const datasetRows = (dataset: unknown, key: string): JsonRecord[] => {
  if (!isRecord(dataset)) {
    throw new ValidationError(
      "The dataset must be a JSON object.",
      "DATASET_INVALID",
    );
  }
  const value = dataset[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new ValidationError(
      `The dataset field "${key}" must be an array of objects.`,
      "DATASET_INVALID",
    );
  }
  return value;
};

const sessionFacultyIds = (session: JsonRecord): string[] => {
  const value = session.faculty_ids ?? session.faculty_id ?? session.faculty;
  if (typeof value === "string") return [value];
  const values = Array.isArray(value)
    ? value
    : value === undefined
      ? []
      : [value];
  const related = values.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (!isRecord(item)) return [];
    const facultyId = fieldString(item, ["faculty_id", "id"]);
    return facultyId ? [facultyId] : [];
  });
  const directFacultyId = fieldString(session, ["faculty_id", "teacher_id"]);
  return [
    ...new Set([...related, ...(directFacultyId ? [directFacultyId] : [])]),
  ];
};

const sessionId = (session: JsonRecord) =>
  fieldString(session, ["session_id", "id"]);

const scheduleEntries = (schedule: Prisma.JsonValue) => {
  if (!isRecord(schedule) || !Array.isArray(schedule.sessions)) {
    throw new ValidationError(
      "The published timetable has an invalid schedule.",
      "DATASET_INVALID",
    );
  }
  return schedule.sessions.filter(isRecord);
};

const countsForDiff = (diff: Prisma.JsonValue[]) => {
  let movedCount = 0;
  let timeChangedCount = 0;
  let roomOnlyCount = 0;
  for (const item of diff) {
    if (!isRecord(item)) continue;
    const from = isRecord(item.from) ? item.from : {};
    const to = isRecord(item.to) ? item.to : {};
    const timeChanged =
      from.day !== to.day ||
      from.start !== to.start ||
      from.start_period !== to.start_period;
    const roomChanged = from.room !== to.room || from.room_id !== to.room_id;
    if (timeChanged || roomChanged) movedCount += 1;
    if (timeChanged) timeChangedCount += 1;
    else if (roomChanged) roomOnlyCount += 1;
  }
  return { movedCount, timeChangedCount, roomOnlyCount };
};

export const applyDisruption = (
  source: Prisma.JsonValue,
  disruption: Disruption,
): Prisma.InputJsonObject => {
  const dataset = asObject(source);
  const updated: Record<string, unknown> = { ...dataset };

  const appendAvailability = (
    collection: "faculty" | "rooms",
    idField: "faculty_id" | "room_id",
    id: string,
    unavailable: Prisma.InputJsonObject,
  ) => {
    const rows = datasetRows({ ...dataset, ...updated }, collection);
    let found = false;
    updated[collection] = rows.map((row) => {
      if (fieldString(row, [idField, "id"]) !== id) return row;
      found = true;
      const current = Array.isArray(row.unavailable) ? row.unavailable : [];
      return { ...row, unavailable: [...current, unavailable] };
    });
    if (!found) {
      throw new ValidationError(
        `The disruption references an unknown ${collection === "faculty" ? "faculty member" : "room"}.`,
        "DATASET_INVALID",
        { id },
      );
    }
  };

  for (const change of disruption.changes) {
    switch (change.type) {
      case "faculty_unavailable":
        appendAvailability("faculty", "faculty_id", change.faculty_id, {
          days: change.days,
          ...(change.periods === undefined ? {} : { periods: change.periods }),
          reason: change.reason,
        });
        break;
      case "room_unavailable":
        appendAvailability("rooms", "room_id", change.room_id, {
          days: change.days,
          ...(change.periods === undefined ? {} : { periods: change.periods }),
          reason: change.reason,
        });
        break;
      case "add_session":
        updated.sessions = [
          ...datasetRows({ ...dataset, ...updated }, "sessions"),
          change.session,
        ];
        break;
      case "add_faculty":
        updated.faculty = [
          ...datasetRows({ ...dataset, ...updated }, "faculty"),
          change.faculty,
        ];
        break;
      case "remove_session": {
        const sessions = datasetRows({ ...dataset, ...updated }, "sessions");
        const remaining = sessions.filter(
          (session) => sessionId(session) !== change.session_id,
        );
        if (remaining.length === sessions.length) {
          throw new ValidationError(
            "The disruption references an unknown session.",
            "DATASET_INVALID",
            { session_id: change.session_id },
          );
        }
        updated.sessions = remaining;
        break;
      }
    }
  }
  return toInputObject(updated);
};

const asInputObject = (
  value: unknown,
  label: string,
): Prisma.InputJsonObject => {
  if (!isRecord(value)) {
    throw new ValidationError(
      `The engine returned an invalid ${label}.`,
      "ENGINE_OUTPUT_INVALID",
    );
  }
  return toInputObject(value);
};

export class ChangesService {
  private readonly repairJob: JobHandler;

  constructor(
    private readonly repository: Pick<
      ChangesRepository,
      | "findActiveBase"
      | "findPublishedTimetable"
      | "findById"
      | "list"
      | "createQueued"
      | "saveRepair"
      | "approve"
      | "review"
      | "deptApprove"
      | "withdraw"
    > = changesRepository,
    private readonly engine: Pick<
      EngineClient,
      "repair" | "validateSchedule"
    > = createEngine(),
    private readonly jobs: Pick<
      JobService,
      "process" | "resumeQueued"
    > = jobService,
  ) {
    this.repairJob = (job) => this.repairFromJob(job);
  }

  async submit(
    actor: RequestUser,
    source: ChangeSource,
    disruption: Disruption,
    originalText?: string,
  ) {
    const context = await this.activePublishedContext();
    return this.queue(actor, {
      source,
      requestedById: actor.id,
      baseDatasetId: context.dataset.id,
      baseTimetableId: context.timetable.id,
      disruption,
      ...(originalText ? { originalText } : {}),
    });
  }

  submitAdmin(actor: RequestUser, disruption: Disruption) {
    return this.submit(actor, ChangeSource.ADMIN_FORM, disruption);
  }

  submitFile(actor: RequestUser, disruption: Disruption) {
    return this.submit(actor, ChangeSource.ADMIN_FILE, disruption);
  }

  async submitFacultyUnavailability(
    actor: RequestUser,
    body: FacultyUnavailabilityBody,
  ) {
    if (!actor.facultyId) {
      throw new ValidationError(
        "The signed-in faculty account has no faculty identifier.",
        "FACULTY_ID_REQUIRED",
      );
    }
    const disruption = {
      changes: [
        {
          type: "faculty_unavailable" as const,
          faculty_id: actor.facultyId,
          days: body.days,
          ...(body.periods === undefined ? {} : { periods: body.periods }),
          reason: body.reason,
        },
      ],
    };
    return this.submit(actor, ChangeSource.FACULTY_UNAVAILABILITY, disruption);
  }

  async submitRequest(actor: RequestUser, body: ChangeRequestBody) {
    const { dataset, timetable } = await this.activePublishedContext();
    const session = datasetRows(dataset.data, "sessions").find(
      (row) => sessionId(row) === body.sessionId,
    );
    if (!session) throw new NotFoundError("The session was not found.");
    this.assertSessionScope(actor, dataset.data, session);

    const current = scheduleEntries(timetable.schedule).find(
      (entry) => fieldString(entry, ["session_id", "id"]) === body.sessionId,
    );
    if (!current) {
      throw new NotFoundError("The session is not on the published timetable.");
    }

    const change =
      body.requestedChange === "extra"
        ? {
            type: "add_session" as const,
            session: {
              ...session,
              ...body.details,
              session_id:
                fieldString(body.details as JsonRecord, ["session_id", "id"]) ??
                `extra-${randomUUID()}`,
              requested_from_session_id: body.sessionId,
              requested_change: "extra",
            },
          }
        : this.moveRequestDisruption(actor, session, current, body);
    const disruption = {
      changes: [change],
      request_metadata: {
        session_id: body.sessionId,
        requested_change: body.requestedChange,
        details: body.details,
        ...(body.preferredDay ? { preferred_day: body.preferredDay } : {}),
        ...(body.preferredPeriod
          ? { preferred_period: body.preferredPeriod }
          : {}),
      },
    } as Disruption;
    const source =
      actor.role === Role.FACULTY
        ? ChangeSource.FACULTY_ASSISTANT
        : ChangeSource.COORDINATOR_REQUEST;
    return this.queue(actor, {
      source,
      requestedById: actor.id,
      baseDatasetId: dataset.id,
      baseTimetableId: timetable.id,
      disruption,
    });
  }

  async list(actor: RequestUser, query: ChangeListQuery) {
    return this.repository.list(this.actor(actor), query.status);
  }

  async getById(id: string, actor: RequestUser) {
    const change = await this.repository.findById(id);
    if (
      !change ||
      (actor.role !== Role.ADMIN && change.requestedById !== actor.id)
    ) {
      throw new NotFoundError("The change proposal was not found.");
    }
    return change;
  }

  async approve(id: string, actor: RequestUser) {
    const change = await this.requireChange(id);
    this.assertCanReview(actor, change);
    if (
      change.status !== ChangeStatus.PROPOSED &&
      change.status !== ChangeStatus.DEPT_APPROVED
    ) {
      throw new ConflictError(
        "The change proposal is not awaiting approval.",
        "STALE_STATE",
      );
    }
    const context = await this.currentBaseContext(change);
    if (!change.proposedSchedule) {
      throw new ConflictError(
        "The change proposal has no repaired schedule.",
        "STALE_STATE",
      );
    }
    const appliedData = change.appliedDataset
      ? asInputObject(change.appliedDataset, "applied dataset")
      : applyDisruption(context.dataset.data, change.disruption as Disruption);
    const schedule = asInputObject(
      change.proposedSchedule,
      "proposed schedule",
    );
    const validation = await this.engine.validateSchedule(
      appliedData,
      schedule,
    );
    if (validation.report.hard_violation_count > 0) {
      throw new ValidationError(
        "The proposed timetable failed validation.",
        "SCHEDULE_RULE_VIOLATION",
        validation.report,
      );
    }
    return this.repository.approve(
      id,
      this.actor(actor),
      appliedData,
      schedule,
      validation.report,
    );
  }

  async reject(id: string, actor: RequestUser, note: string) {
    const change = await this.requireChange(id);
    this.assertCanReview(actor, change);
    return this.repository.review(
      id,
      this.actor(actor),
      ChangeStatus.REJECTED,
      note,
    );
  }

  async deptApprove(id: string, actor: RequestUser) {
    const change = await this.requireChange(id);
    if (
      change.requestedBy.role !== Role.FACULTY ||
      change.requestedBy.department !== actor.department
    ) {
      throw new NotFoundError("The change proposal was not found.");
    }
    if (change.requestedById === actor.id) {
      throw new ForbiddenError(
        "A coordinator cannot approve their own change proposal.",
        "SELF_APPROVAL_NOT_ALLOWED",
      );
    }
    return this.repository.deptApprove(id, this.actor(actor));
  }

  withdraw(id: string, actor: RequestUser) {
    return this.repository.withdraw(id, this.actor(actor));
  }

  async resumeQueuedJobs() {
    await this.jobs.resumeQueued(JobKind.REPAIR, this.repairJob);
  }

  private async queue(actor: RequestUser, input: ChangeCreateInput) {
    const created = await this.repository.createQueued(
      this.actor(actor),
      input,
    );
    void this.jobs.process(created.jobId, this.repairJob);
    return { jobId: created.jobId, changeId: created.change.id };
  }

  private async activePublishedContext() {
    const dataset = await this.repository.findActiveBase();
    if (!dataset) {
      throw new ConflictError(
        "There is no active dataset.",
        "NO_ACTIVE_DATASET",
      );
    }
    const timetable = await this.repository.findPublishedTimetable(dataset.id);
    if (!timetable) {
      throw new ConflictError(
        "There is no published timetable for the active dataset.",
        "NO_PUBLISHED_TIMETABLE",
      );
    }
    return { dataset, timetable };
  }

  private async currentBaseContext(change: ChangeRecord) {
    const [dataset, timetable] = await Promise.all([
      this.repository.findActiveBase(),
      this.repository.findPublishedTimetable(change.baseDatasetId),
    ]);
    if (
      !dataset ||
      dataset.id !== change.baseDatasetId ||
      !timetable ||
      timetable.id !== change.baseTimetableId
    ) {
      throw new ConflictError(
        "The base timetable is no longer the published timetable.",
        "STALE_STATE",
      );
    }
    return { dataset, timetable };
  }

  private async repairFromJob(
    job: Job & { createdBy?: { role: Role } | null },
  ) {
    const params = job.params;
    if (!isRecord(params) || typeof params.changeId !== "string") {
      throw new ValidationError(
        "The repair job has invalid parameters.",
        "DATASET_INVALID",
      );
    }
    const change = await this.repository.findById(params.changeId);
    if (!change || !isRecord(change.baseDataset)) {
      throw new NotFoundError("The change proposal was not found.");
    }
    const datasetId = change.baseDatasetId;
    const dataset = await this.repository.findActiveBase();
    if (!dataset || dataset.id !== datasetId) {
      throw new ConflictError(
        "The proposal's base dataset is no longer active.",
        "STALE_STATE",
      );
    }
    const timetable = await this.repository.findPublishedTimetable(datasetId);
    if (!timetable || timetable.id !== change.baseTimetableId) {
      throw new ConflictError(
        "The proposal's base timetable is no longer published.",
        "STALE_STATE",
      );
    }
    const result = await this.engine.repair(
      toInputObject(dataset.data),
      timetable.schedule,
      asInputObject(change.disruption, "disruption"),
      60,
    );
    if (result.status === "impossible") {
      const explanation = result.explanation.trim();
      const impossible = {
        status: "IMPOSSIBLE" as const,
        conflicts: result.conflicts as Prisma.InputJsonValue,
        explanation,
      };
      return {
        resultType: "ChangeProposal",
        persist: (tx: Prisma.TransactionClient) =>
          this.repository.saveRepair(tx, change.id, impossible, {
            id: job.createdById,
            role: job.createdBy?.role ?? null,
          }),
      };
    }
    if (result.report.hard_violation_count > 0) {
      throw new ValidationError(
        "The engine proposed a timetable with hard violations.",
        "SCHEDULE_RULE_VIOLATION",
        result.report,
      );
    }
    const diff = result.diff as Prisma.JsonValue[];
    const counts = countsForDiff(diff);
    const proposed = {
      status: "PROPOSED" as const,
      proposedSchedule: result.schedule_after as Prisma.InputJsonValue,
      diff: diff as Prisma.InputJsonValue,
      movedCount: result.moved_count ?? counts.movedCount,
      timeChangedCount: result.time_changed_count ?? counts.timeChangedCount,
      roomOnlyCount: result.room_only_count ?? counts.roomOnlyCount,
      report: result.report as Prisma.InputJsonValue,
    };
    const persistResult = {
      ...proposed,
      ...(result.applied_dataset
        ? { appliedDataset: result.applied_dataset as Prisma.InputJsonValue }
        : {}),
    };
    return {
      resultType: "ChangeProposal",
      persist: async (tx: Prisma.TransactionClient) => {
        const saved = await this.repository.saveRepair(
          tx,
          change.id,
          proposed,
          {
            id: job.createdById,
            role: job.createdBy?.role ?? null,
          },
        );
        if (persistResult.appliedDataset) {
          await tx.changeProposal.update({
            where: { id: change.id },
            data: { appliedDataset: persistResult.appliedDataset },
          });
        }
        return saved;
      },
    };
  }

  private assertCanReview(user: RequestUser, change: ChangeRecord) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenError("Only an Admin can review this proposal.");
    }
    // Admin-form and file disruptions are institute-level actions, not personal requests.
    const personalSources: ChangeSource[] = [
      ChangeSource.FACULTY_ASSISTANT,
      ChangeSource.FACULTY_UNAVAILABILITY,
      ChangeSource.COORDINATOR_REQUEST,
    ];
    if (
      personalSources.includes(change.source) &&
      change.requestedById === user.id
    ) {
      throw new ForbiddenError(
        "A requester cannot review their own change proposal.",
        "SELF_APPROVAL_NOT_ALLOWED",
      );
    }
  }

  private async requireChange(id: string) {
    const change = await this.repository.findById(id);
    if (!change) throw new NotFoundError("The change proposal was not found.");
    return change;
  }

  private assertSessionScope(
    actor: RequestUser,
    dataset: Prisma.JsonValue,
    session: JsonRecord,
  ) {
    const facultyIds = sessionFacultyIds(session);
    const facultyRows = datasetRows(dataset, "faculty");
    if (actor.role === Role.FACULTY) {
      if (!actor.facultyId || !facultyIds.includes(actor.facultyId)) {
        throw new NotFoundError("The session was not found.");
      }
      return;
    }
    if (actor.role === Role.COORDINATOR) {
      const belongsToDepartment = facultyRows.some(
        (faculty) =>
          facultyIds.includes(
            fieldString(faculty, ["faculty_id", "id"]) ?? "",
          ) &&
          fieldString(faculty, ["department", "department_id"]) ===
            actor.department,
      );
      if (!belongsToDepartment) {
        throw new NotFoundError("The session was not found.");
      }
    }
  }

  private moveRequestDisruption(
    actor: RequestUser,
    session: JsonRecord,
    placement: JsonRecord,
    body: ChangeRequestBody,
  ) {
    const facultyId = actor.facultyId ?? sessionFacultyIds(session)[0] ?? "";
    if (!facultyId) {
      throw new ValidationError(
        "The session has no faculty member to associate with the move request.",
        "DATASET_INVALID",
      );
    }
    const day = fieldString(placement, ["day"]) ?? body.preferredDay;
    const start = placement.start_period;
    const periods =
      typeof start === "number"
        ? [start]
        : body.preferredPeriod
          ? [body.preferredPeriod]
          : undefined;
    return {
      type: "faculty_unavailable" as const,
      faculty_id: facultyId,
      days: [day ?? body.preferredDay ?? "MON"],
      ...(periods ? { periods } : {}),
      reason: "Requested session move.",
      session_id: body.sessionId,
      requested_change: "move",
      details: body.details,
      ...(body.preferredDay ? { preferred_day: body.preferredDay } : {}),
      ...(body.preferredPeriod
        ? { preferred_period: body.preferredPeriod }
        : {}),
    };
  }

  private actor(user: RequestUser): ChangeActor {
    return {
      id: user.id,
      role: user.role,
      department: user.department,
    };
  }
}

export const changesService = new ChangesService();
