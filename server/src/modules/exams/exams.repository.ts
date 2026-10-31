import {
  Prisma,
  PublishStatus,
  type ExamSchedule,
  type PrismaClient,
  type Role,
} from "@prisma/client";
import { audit } from "../../audit/audit.service.js";
import { prisma } from "../../lib/prisma.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../utils/api-error.js";
import type { ExamGenerationResult } from "../../lib/engine/index.js";

export type ExamActor = { id: string; role: Role };

export class ExamsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findActiveDataset() {
    return this.client.dataset.findFirst({
      where: { isActive: true },
      select: { id: true, data: true },
    });
  }

  async findDatasetById(id: string) {
    return this.client.dataset.findUnique({
      where: { id },
      select: { id: true, data: true },
    });
  }

  async findPriorityOrder() {
    return this.client.appSetting.findUnique({
      where: { key: "priority_order" },
      select: { value: true },
    });
  }

  async findPublishedTimetable(datasetId: string) {
    return this.client.timetable.findFirst({
      where: { datasetId, status: PublishStatus.PUBLISHED },
      orderBy: { publishedAt: "desc" },
      select: { id: true, schedule: true },
    });
  }

  async findTimetableById(datasetId: string, id: string) {
    return this.client.timetable.findFirst({
      where: { id, datasetId, status: PublishStatus.PUBLISHED },
      select: { id: true, schedule: true },
    });
  }

  async list(page: number, limit: number) {
    const where = {};
    const [items, total] = await Promise.all([
      this.client.examSchedule.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          datasetId: true,
          status: true,
          hardViolationCount: true,
          softPenalty: true,
          publishedAt: true,
          createdAt: true,
        },
      }),
      this.client.examSchedule.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: string) {
    return this.client.examSchedule.findUnique({
      where: { id },
      select: {
        id: true,
        datasetId: true,
        status: true,
        exams: true,
        report: true,
        hardViolationCount: true,
        softPenalty: true,
        generatedById: true,
        publishedAt: true,
        createdAt: true,
      },
    });
  }

  async findPublished() {
    return this.client.examSchedule.findFirst({
      where: { status: PublishStatus.PUBLISHED },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        datasetId: true,
        status: true,
        exams: true,
        report: true,
        hardViolationCount: true,
        softPenalty: true,
        publishedAt: true,
        createdAt: true,
      },
    });
  }

  async createDraft(
    tx: Prisma.TransactionClient,
    job: { createdById: string | null; createdByRole: Role | null },
    datasetId: string,
    result: ExamGenerationResult,
  ): Promise<ExamSchedule> {
    const schedule = await tx.examSchedule.create({
      data: {
        datasetId,
        status: PublishStatus.DRAFT,
        exams: result.exams,
        report: result.report,
        hardViolationCount: result.report.hard_violation_count,
        softPenalty: result.report.soft_penalty,
        generatedById: job.createdById,
      },
    });

    await audit(tx, {
      actorId: job.createdById,
      actorRole: job.createdByRole,
      action: "EXAM_SCHEDULE_GENERATED",
      entityType: "ExamSchedule",
      entityId: schedule.id,
      summary: "A draft exam schedule was generated.",
      details: {
        datasetId,
        hardViolationCount: result.report.hard_violation_count,
        softPenalty: result.report.soft_penalty,
      },
    });

    return schedule;
  }

  async publish(id: string, actor: ExamActor) {
    return this.client.$transaction(
      async (tx) => {
        const draft = await tx.examSchedule.findUnique({
          where: { id },
          select: {
            id: true,
            status: true,
            hardViolationCount: true,
            report: true,
          },
        });

        if (!draft) {
          throw new NotFoundError("The exam schedule was not found.");
        }
        if (draft.status !== PublishStatus.DRAFT) {
          throw new ConflictError(
            "Only a draft exam schedule can be published.",
            "STALE_STATE",
          );
        }
        if (draft.hardViolationCount !== 0) {
          throw new ValidationError(
            "An exam schedule with hard violations cannot be published.",
            "SCHEDULE_RULE_VIOLATION",
            draft.report,
          );
        }

        const previouslyPublished = await tx.examSchedule.findMany({
          where: { status: PublishStatus.PUBLISHED },
          select: { id: true },
        });
        await tx.examSchedule.updateMany({
          where: { status: PublishStatus.PUBLISHED },
          data: { status: PublishStatus.ARCHIVED },
        });
        for (const archived of previouslyPublished) {
          await audit(tx, {
            actorId: actor.id,
            actorRole: actor.role,
            action: "EXAM_SCHEDULE_ARCHIVED",
            entityType: "ExamSchedule",
            entityId: archived.id,
            summary: "A previously published exam schedule was archived.",
            details: { replacedById: id },
          });
        }

        const published = await tx.examSchedule.updateMany({
          where: {
            id,
            status: PublishStatus.DRAFT,
            hardViolationCount: 0,
          },
          data: { status: PublishStatus.PUBLISHED, publishedAt: new Date() },
        });

        if (published.count !== 1) {
          throw new ConflictError(
            "The exam schedule changed before it could be published.",
            "STALE_STATE",
          );
        }

        const schedule = await tx.examSchedule.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            datasetId: true,
            status: true,
            exams: true,
            report: true,
            hardViolationCount: true,
            softPenalty: true,
            publishedAt: true,
            createdAt: true,
          },
        });

        await audit(tx, {
          actorId: actor.id,
          actorRole: actor.role,
          action: "EXAM_SCHEDULE_PUBLISHED",
          entityType: "ExamSchedule",
          entityId: schedule.id,
          summary: "An exam schedule was published.",
          details: { datasetId: schedule.datasetId },
        });

        return schedule;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
