import { JobKind, Prisma, type Job, type Role } from "@prisma/client";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../utils/api-error.js";
import { prisma } from "../../lib/prisma.js";
import {
  createEngine,
  type EngineClient,
  type ExamGenerationResult,
} from "../../lib/engine/index.js";
import {
  JobService,
  type JobHandler,
  jobService,
} from "../../jobs/job.service.js";
import type { ListExamsQuery } from "./exams.schema.js";
import { ExamsRepository, type ExamActor } from "./exams.repository.js";

type JsonObject = Prisma.JsonObject;
type GroupExam = {
  exam_id: string;
  course: Prisma.JsonValue;
  day: string;
  session: "AM" | "PM";
  rooms: Prisma.JsonValue[];
};

const isJsonObject = (value: Prisma.JsonValue): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (value: Prisma.JsonValue | undefined): string | null =>
  typeof value === "string" ? value : null;

const getGroupIds = (exam: JsonObject): string[] => {
  const groupIds = exam.group_ids;
  if (Array.isArray(groupIds)) {
    return groupIds.filter(
      (value): value is string => typeof value === "string",
    );
  }
  if (typeof exam.group_id === "string") return [exam.group_id];

  const groups = exam.groups;
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group) => {
    if (typeof group === "string") return [group];
    if (!isJsonObject(group)) return [];
    const id = getString(group.group_id) ?? getString(group.id);
    return id ? [id] : [];
  });
};

const normalizeGroupExam = (value: Prisma.JsonValue): GroupExam | null => {
  if (!isJsonObject(value)) return null;

  const examId = getString(value.exam_id);
  const day = getString(value.day);
  const session = getString(value.session);
  const course = value.course ?? value.course_id ?? value.course_ids;
  const rooms = value.rooms;
  if (
    !examId ||
    !day ||
    (session !== "AM" && session !== "PM") ||
    course === undefined ||
    !Array.isArray(rooms) ||
    getGroupIds(value).length === 0
  ) {
    return null;
  }

  return { exam_id: examId, course, day, session, rooms };
};

const validateExamRows = (result: ExamGenerationResult): void => {
  const invalidExamIndexes = result.exams.flatMap((exam, index) =>
    normalizeGroupExam(exam) ? [] : [index],
  );
  if (invalidExamIndexes.length > 0) {
    throw new ValidationError(
      "The engine returned exams without the required public schedule fields.",
      "ENGINE_OUTPUT_INVALID",
      invalidExamIndexes.map((index) => `exams.${index}`),
    );
  }
};

const withPriorityOrder = (
  dataset: Prisma.JsonValue,
  priorityOrder: Prisma.JsonValue | undefined,
): Prisma.JsonValue => {
  if (!isJsonObject(dataset)) {
    throw new ValidationError(
      "The active dataset must be a JSON object.",
      "DATASET_INVALID",
    );
  }

  if (priorityOrder === undefined) return dataset;
  return { ...dataset, priority_order: priorityOrder };
};

const getJobParams = (
  params: Prisma.JsonValue | null,
): { datasetId: string; publishedTimetableId: string | null } => {
  if (!params || !isJsonObject(params)) {
    throw new ValidationError(
      "The generation job is missing its input references.",
      "DATASET_INVALID",
    );
  }
  const datasetId = getString(params.datasetId);
  const publishedTimetableId =
    params.publishedTimetableId === null
      ? null
      : getString(params.publishedTimetableId);
  if (
    !datasetId ||
    (publishedTimetableId === null && params.publishedTimetableId !== null)
  ) {
    throw new ValidationError(
      "The generation job contains invalid input references.",
      "DATASET_INVALID",
    );
  }
  return { datasetId, publishedTimetableId };
};

export class ExamsService {
  private readonly generateJob: JobHandler;

  constructor(
    private readonly repository: Pick<
      ExamsRepository,
      | "findActiveDataset"
      | "findDatasetById"
      | "findPriorityOrder"
      | "findPublishedTimetable"
      | "findTimetableById"
      | "list"
      | "findById"
      | "findPublished"
      | "createDraft"
      | "publish"
    > = new ExamsRepository(),
    private readonly engine: EngineClient = createEngine(),
    private readonly jobs: Pick<
      JobService,
      "enqueue" | "process" | "resumeQueued"
    > = jobService,
  ) {
    this.generateJob = (job) => this.generateFromJob(job);
  }

  async generate(actor: ExamActor): Promise<{ jobId: string }> {
    const activeDataset = await this.repository.findActiveDataset();
    if (!activeDataset) {
      throw new ConflictError(
        "There is no active dataset to generate exams from.",
        "NO_ACTIVE_DATASET",
      );
    }

    const timetable = await this.repository.findPublishedTimetable(
      activeDataset.id,
    );
    const job = await this.jobs.enqueue(JobKind.GENERATE_EXAMS, actor, {
      datasetId: activeDataset.id,
      publishedTimetableId: timetable?.id ?? null,
    });

    void this.jobs.process(job.id, this.generateJob);
    return { jobId: job.id };
  }

  async resumeQueuedJobs(): Promise<void> {
    await this.jobs.resumeQueued(JobKind.GENERATE_EXAMS, this.generateJob);
  }

  list(query: ListExamsQuery) {
    return this.repository.list(query.page, query.limit);
  }

  async getById(id: string) {
    const schedule = await this.repository.findById(id);
    if (!schedule) {
      throw new NotFoundError("The exam schedule was not found.");
    }
    return schedule;
  }

  async getPublished() {
    const schedule = await this.repository.findPublished();
    if (!schedule) {
      throw new ConflictError(
        "There is no published exam schedule.",
        "NO_PUBLISHED_EXAM_SCHEDULE",
      );
    }
    return schedule;
  }

  async getPublishedForGroup(groupId: string): Promise<GroupExam[]> {
    const schedule = await this.getPublished();
    if (!Array.isArray(schedule.exams)) {
      throw new ValidationError(
        "The published exam schedule has an invalid format.",
        "ENGINE_OUTPUT_INVALID",
      );
    }

    const exams = schedule.exams as Prisma.JsonArray;
    return exams.flatMap((exam) => {
      const normalized = normalizeGroupExam(exam);
      if (!normalized || !isJsonObject(exam)) {
        throw new ValidationError(
          "The published exam schedule has an invalid exam entry.",
          "ENGINE_OUTPUT_INVALID",
        );
      }
      return getGroupIds(exam).includes(groupId) ? [normalized] : [];
    });
  }

  publish(id: string, actor: ExamActor) {
    return this.repository.publish(id, actor);
  }

  private async generateFromJob(
    job: Job & { createdBy?: { role: Role } | null },
  ) {
    const { datasetId, publishedTimetableId } = getJobParams(job.params);
    const dataset = await this.repository.findDatasetById(datasetId);
    if (!dataset) {
      throw new ValidationError(
        "The dataset for this exam generation job no longer exists.",
        "DATASET_INVALID",
      );
    }

    const [prioritySetting, timetable] = await Promise.all([
      this.repository.findPriorityOrder(),
      publishedTimetableId
        ? this.repository.findTimetableById(datasetId, publishedTimetableId)
        : Promise.resolve(null),
    ]);
    if (publishedTimetableId && !timetable) {
      throw new ConflictError(
        "The published timetable used for exam generation is no longer available.",
        "STALE_STATE",
      );
    }

    const engineDataset = withPriorityOrder(
      dataset.data,
      prioritySetting?.value,
    );
    const result = await this.engine.generateExams(
      engineDataset,
      timetable?.schedule,
    );

    if (result.report.hard_violation_count > 0) {
      throw new ValidationError(
        "The engine rejected the exam schedule because it has hard violations.",
        "SCHEDULE_RULE_VIOLATION",
        result.report,
      );
    }
    validateExamRows(result);

    return {
      resultType: "ExamSchedule",
      persist: async (tx: Prisma.TransactionClient, claimedJob: Job) => {
        const schedule = await this.repository.createDraft(
          tx,
          {
            createdById: claimedJob.createdById,
            createdByRole: job.createdBy?.role ?? null,
          },
          datasetId,
          result,
        );
        return schedule.id;
      },
    };
  }
}

export const examsService = new ExamsService();
