import { JobKind, Prisma, PublishStatus, Role, type Job } from "@prisma/client";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../utils/api-error.js";
import {
  createEngine,
  type DatasetValidationResult,
  type EngineClient,
} from "../../lib/engine/index.js";
import { prisma } from "../../lib/prisma.js";
import {
  JobService,
  jobService,
  type JobHandler,
} from "../../jobs/job.service.js";
import type { RequestUser } from "../../types/express.js";
import type { TimetableListQuery } from "./timetables.schema.js";
import {
  TimetablesRepository,
  type TimetableActor,
} from "./timetables.repository.js";
import type {
  FreeRoomsQuery,
  ManualValidationBody,
} from "./timetables.schema.js";

type JsonRecord = Prisma.JsonObject;
type ScheduleEntry = {
  session_id: string;
  day: string;
  start_period: number;
  room_id: string;
};
const isRecord = (value: Prisma.JsonValue): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringAt = (record: JsonRecord, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
};

const relatedIds = (
  record: JsonRecord,
  keys: string[],
  idKeys: string[],
): string[] =>
  keys.flatMap((key) => {
    const value = record[key];
    if (typeof value === "string") return [value];
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (typeof item === "string") return [item];
      if (!isRecord(item)) return [];
      const id = stringAt(item, idKeys);
      return id ? [id] : [];
    });
  });

const listField = (dataset: Prisma.JsonValue, field: string): JsonRecord[] => {
  if (!isRecord(dataset)) {
    throw new ValidationError(
      "The active dataset is invalid.",
      "DATASET_INVALID",
    );
  }
  const value = dataset[field];
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new ValidationError(
      `The dataset field "${field}" must be an array of objects.`,
      "DATASET_INVALID",
    );
  }
  return value;
};

const scheduleEntries = (value: Prisma.JsonValue): ScheduleEntry[] => {
  if (!isRecord(value) || !Array.isArray(value.sessions)) {
    throw new ValidationError(
      "The stored timetable has an invalid schedule shape.",
      "DATASET_INVALID",
    );
  }
  return value.sessions.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.session_id !== "string" ||
      typeof entry.day !== "string" ||
      typeof entry.start_period !== "number" ||
      typeof entry.room_id !== "string"
    ) {
      throw new ValidationError(
        "The stored timetable contains an invalid entry.",
        "DATASET_INVALID",
        [`schedule.sessions.${index}`],
      );
    }
    return {
      session_id: entry.session_id,
      day: entry.day,
      start_period: entry.start_period,
      room_id: entry.room_id,
    };
  });
};

const objectValue = (value: Prisma.JsonValue): Prisma.InputJsonObject => {
  if (!isRecord(value)) {
    throw new ValidationError(
      "The active dataset is invalid.",
      "DATASET_INVALID",
    );
  }
  return value;
};

const datasetWithPriority = (
  dataset: Prisma.JsonValue,
  priority: Prisma.JsonValue | undefined,
): Prisma.InputJsonObject => {
  const input = objectValue(dataset);
  return priority === undefined
    ? input
    : { ...input, priority_order: priority };
};

const getJobDatasetId = (params: Prisma.JsonValue | null): string => {
  if (!params || !isRecord(params) || typeof params.datasetId !== "string") {
    throw new ValidationError(
      "The generation job has invalid dataset parameters.",
      "DATASET_INVALID",
    );
  }
  return params.datasetId;
};

const assertNoHardViolations = (validation: DatasetValidationResult): void => {
  if (validation.report.hard_violation_count > 0) {
    throw new ValidationError(
      "The engine validator rejected the timetable.",
      "SCHEDULE_RULE_VIOLATION",
      validation.report,
    );
  }
};

const getSessionIndex = (
  dataset: Prisma.JsonValue,
): Map<string, JsonRecord> => {
  const sessions = listField(dataset, "sessions");
  const index = new Map<string, JsonRecord>();
  for (const session of sessions) {
    const id = stringAt(session, ["session_id", "id"]);
    if (!id) {
      throw new ValidationError(
        "A dataset session has no session_id.",
        "DATASET_INVALID",
      );
    }
    index.set(id, session);
  }
  return index;
};

const getRoomIndex = (dataset: Prisma.JsonValue): Map<string, JsonRecord> => {
  const rooms = listField(dataset, "rooms");
  const index = new Map<string, JsonRecord>();
  for (const room of rooms) {
    const id = stringAt(room, ["room_id", "id"]);
    if (!id) {
      throw new ValidationError(
        "A dataset room has no room_id.",
        "DATASET_INVALID",
      );
    }
    index.set(id, room);
  }
  return index;
};

const buildView = (
  dataset: Prisma.JsonValue,
  schedule: Prisma.JsonValue,
  matches: (session: JsonRecord, placement: ScheduleEntry) => boolean,
) => {
  const sessionIndex = getSessionIndex(dataset);
  const roomIndex = getRoomIndex(dataset);
  return scheduleEntries(schedule).flatMap((placement) => {
    const session = sessionIndex.get(placement.session_id);
    if (!session) {
      throw new ValidationError(
        "The timetable references a session missing from its dataset.",
        "DATASET_INVALID",
        { session_id: placement.session_id },
      );
    }
    if (!matches(session, placement)) return [];
    const room = roomIndex.get(placement.room_id);
    if (!room) {
      throw new ValidationError(
        "The timetable references a room missing from its dataset.",
        "DATASET_INVALID",
        { room_id: placement.room_id },
      );
    }
    return [
      {
        ...session,
        ...placement,
        room,
      },
    ];
  });
};

const groupsForSession = (session: JsonRecord): string[] =>
  relatedIds(session, ["group_ids", "groups"], ["group_id", "id"]).concat(
    stringAt(session, ["group_id"]) ?? [],
  );

const facultyForSession = (session: JsonRecord): string[] =>
  relatedIds(session, ["faculty_ids", "faculty"], ["faculty_id", "id"]).concat(
    stringAt(session, ["faculty_id", "teacher_id"]) ?? [],
  );

export class TimetablesService {
  private readonly generateJob: JobHandler;

  constructor(
    private readonly repository: Pick<
      TimetablesRepository,
      | "findActiveDataset"
      | "findDatasetById"
      | "findPriorityOrder"
      | "list"
      | "findById"
      | "findPublishedForActiveDataset"
      | "enqueueGeneration"
      | "createDraft"
      | "saveValidation"
      | "publish"
      | "deleteDraft"
    >,
    private readonly engine: Pick<
      EngineClient,
      "generateTimetable" | "validateSchedule"
    >,
    private readonly jobs: Pick<
      JobService,
      "process" | "resumeQueued"
    > = jobService,
  ) {
    this.generateJob = (job) => this.generateFromJob(job);
  }

  async generate(actor: TimetableActor): Promise<{ jobId: string }> {
    const dataset = await this.repository.findActiveDataset();
    if (!dataset) {
      throw new ConflictError(
        "There is no active dataset.",
        "NO_ACTIVE_DATASET",
      );
    }
    const job = await this.repository.enqueueGeneration(actor, dataset.id);
    void this.jobs.process(job.id, this.generateJob);
    return { jobId: job.id };
  }

  async resumeQueuedJobs(): Promise<void> {
    await this.jobs.resumeQueued(JobKind.GENERATE_TIMETABLE, this.generateJob);
  }

  list(query: TimetableListQuery) {
    return this.repository.list(query);
  }

  async getById(id: string) {
    const timetable = await this.loadById(id);
    const { dataset: _dataset, ...details } = timetable;
    return details;
  }

  private async loadById(id: string) {
    const timetable = await this.repository.findById(id);
    if (!timetable) throw new NotFoundError("The timetable was not found.");
    return timetable;
  }

  async getPublished() {
    const timetable = await this.loadPublished();
    const { dataset: _dataset, ...details } = timetable;
    return details;
  }

  private async loadPublished() {
    const timetable = await this.repository.findPublishedForActiveDataset();
    if (!timetable) {
      throw new ConflictError(
        "There is no published timetable for the active dataset.",
        "NO_PUBLISHED_TIMETABLE",
      );
    }
    return timetable;
  }

  async getGroupView(groupId: string) {
    const timetable = await this.loadPublished();
    const groups = listField(timetable.dataset.data, "groups");
    if (
      !groups.some((group) => stringAt(group, ["group_id", "id"]) === groupId)
    ) {
      throw new NotFoundError("The group was not found.");
    }
    return buildView(timetable.dataset.data, timetable.schedule, (session) =>
      groupsForSession(session).includes(groupId),
    );
  }

  async getFacultyView(facultyId: string, actor: RequestUser) {
    if (actor.role === Role.FACULTY && actor.facultyId !== facultyId) {
      throw new NotFoundError("The faculty timetable was not found.");
    }
    const timetable = await this.loadPublished();
    const faculty = listField(timetable.dataset.data, "faculty");
    const target = faculty.find(
      (entry) => stringAt(entry, ["faculty_id", "id"]) === facultyId,
    );
    if (!target) throw new NotFoundError("The faculty member was not found.");
    if (
      actor.role === Role.COORDINATOR &&
      stringAt(target, ["department", "department_id"]) !== actor.department
    ) {
      throw new NotFoundError("The faculty timetable was not found.");
    }
    return buildView(timetable.dataset.data, timetable.schedule, (session) =>
      facultyForSession(session).includes(facultyId),
    );
  }

  async getRoomView(roomId: string) {
    const timetable = await this.loadPublished();
    const rooms = getRoomIndex(timetable.dataset.data);
    if (!rooms.has(roomId)) throw new NotFoundError("The room was not found.");
    return buildView(
      timetable.dataset.data,
      timetable.schedule,
      (_session, placement) => placement.room_id === roomId,
    );
  }

  async getGroups() {
    const dataset = await this.repository.findActiveDataset();
    if (!dataset)
      throw new ConflictError(
        "There is no active dataset.",
        "NO_ACTIVE_DATASET",
      );
    return listField(dataset.data, "groups");
  }

  async getFreeRooms(query: FreeRoomsQuery) {
    const timetable = await this.loadPublished();
    const dataset = timetable.dataset.data;
    const sessions = getSessionIndex(dataset);
    const occupied = new Set(
      scheduleEntries(timetable.schedule)
        .filter((entry) => {
          if (entry.day !== query.day) return false;
          const session = sessions.get(entry.session_id);
          if (!session) {
            throw new ValidationError(
              "The timetable references a session missing from its dataset.",
              "DATASET_INVALID",
              { session_id: entry.session_id },
            );
          }
          const length =
            typeof session.duration_periods === "number"
              ? session.duration_periods
              : 1;
          return (
            query.period >= entry.start_period &&
            query.period < entry.start_period + length
          );
        })
        .map((entry) => entry.room_id),
    );

    return [...getRoomIndex(dataset).entries()]
      .filter(([id, room]) => {
        if (occupied.has(id)) return false;
        const capacity =
          typeof room.capacity === "number"
            ? room.capacity
            : typeof room.seats === "number"
              ? room.seats
              : null;
        const roomType = stringAt(room, ["type", "room_type"]);
        if (
          query.capacity !== undefined &&
          (capacity === null || capacity < query.capacity)
        ) {
          return false;
        }
        return query.type === undefined || roomType === query.type;
      })
      .map(([id, room]) => ({ ...room, room_id: id }));
  }

  async validateStored(id: string, actor: TimetableActor) {
    const timetable = await this.loadById(id);
    if (timetable.status !== PublishStatus.DRAFT) {
      throw new ConflictError(
        "Only a draft timetable can be validated.",
        "STALE_STATE",
      );
    }
    const validation = await this.engine.validateSchedule(
      objectValue(timetable.dataset.data),
      objectValue(timetable.schedule),
    );
    assertNoHardViolations(validation);
    return this.repository.saveValidation(id, actor, validation);
  }

  async publish(id: string, actor: TimetableActor) {
    const timetable = await this.loadById(id);
    if (timetable.status !== PublishStatus.DRAFT) {
      throw new ConflictError(
        "Only a draft timetable can be published.",
        "STALE_STATE",
      );
    }
    const validation = await this.engine.validateSchedule(
      objectValue(timetable.dataset.data),
      objectValue(timetable.schedule),
    );
    assertNoHardViolations(validation);
    return this.repository.publish(id, actor, validation);
  }

  deleteDraft(id: string, actor: TimetableActor) {
    return this.repository.deleteDraft(id, actor);
  }

  async validateManual(input: ManualValidationBody) {
    const dataset = await this.repository.findActiveDataset();
    if (!dataset)
      throw new ConflictError(
        "There is no active dataset.",
        "NO_ACTIVE_DATASET",
      );
    const validation = await this.engine.validateSchedule(
      objectValue(dataset.data),
      input.schedule,
    );
    assertNoHardViolations(validation);
    return validation.report;
  }

  private async generateFromJob(
    job: Job & { createdBy?: { role: Role } | null },
  ) {
    const datasetId = getJobDatasetId(job.params);
    const dataset = await this.repository.findDatasetById(datasetId);
    if (!dataset)
      throw new ConflictError("The job dataset was not found.", "STALE_STATE");
    const priority = await this.repository.findPriorityOrder();
    const engineDataset = datasetWithPriority(dataset.data, priority?.value);
    const generated = await this.engine.generateTimetable(engineDataset);
    const validation = await this.engine.validateSchedule(
      engineDataset,
      generated.schedule,
    );
    assertNoHardViolations(validation);
    return {
      resultType: "Timetable",
      persist: async (tx: Prisma.TransactionClient, claimedJob: Job) => {
        const timetable = await this.repository.createDraft(
          tx,
          {
            createdById: claimedJob.createdById,
            createdByRole: job.createdBy?.role ?? null,
          },
          datasetId,
          generated,
          validation.report,
        );
        return timetable.id;
      },
    };
  }
}

export const timetablesService = new TimetablesService(
  new TimetablesRepository(prisma),
  createEngine(),
);
