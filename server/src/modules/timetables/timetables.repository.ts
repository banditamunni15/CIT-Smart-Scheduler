import {
  ApprovalState,
  JobKind,
  Prisma,
  PublishStatus,
  RequestStatus,
  type PrismaClient,
  type Role,
  type Timetable,
} from "@prisma/client";
import { audit } from "../../audit/audit.service.js";
import { prisma } from "../../lib/prisma.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../utils/api-error.js";
import type {
  DatasetValidationResult,
  TimetableGenerationResult,
} from "../../lib/engine/index.js";
import type { TimetableListQuery } from "./timetables.schema.js";

export type TimetableActor = { id: string; role: Role };

export class TimetablesRepository {
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

  async list(query: TimetableListQuery) {
    const [items, total] = await Promise.all([
      this.client.timetable.findMany({
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          datasetId: true,
          status: true,
          label: true,
          hardViolationCount: true,
          softTotal: true,
          publishedAt: true,
          createdAt: true,
          generatedById: true,
        },
      }),
      this.client.timetable.count(),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  }

  async findById(id: string) {
    return this.client.timetable.findUnique({
      where: { id },
      select: {
        id: true,
        datasetId: true,
        status: true,
        label: true,
        schedule: true,
        report: true,
        hardViolationCount: true,
        softTotal: true,
        softBreakdown: true,
        solverMeta: true,
        generatedById: true,
        publishedById: true,
        publishedAt: true,
        createdAt: true,
        dataset: { select: { data: true } },
      },
    });
  }


  async findApprovedRoomCommitments(datasetId: string) {
    const decisions = await this.client.bookingDecision.findMany({
      where: {
        isCurrent: true,
        approvalState: { in: [ApprovalState.NOT_REQUIRED, ApprovalState.APPROVED] },
        request: { datasetId, status: RequestStatus.APPROVED },
      },
      select: { day: true, startPeriod: true, endPeriod: true, roomId: true },
    });
    const overrides = await this.client.sessionOverride.findMany({
      where: {
        decision: {
          isCurrent: true,
          approvalState: ApprovalState.APPROVED,
          request: { datasetId, status: RequestStatus.APPROVED },
        },
      },
      select: {
        sessionId: true, fromDay: true, fromStart: true, fromRoom: true,
        toDay: true, toStart: true, toRoom: true,
      },
    });
    return { decisions, overrides };
  }

  async findPublishedForActiveDataset() {
    return this.client.timetable.findFirst({
      where: {
        status: PublishStatus.PUBLISHED,
        dataset: { isActive: true },
      },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        datasetId: true,
        status: true,
        label: true,
        schedule: true,
        report: true,
        hardViolationCount: true,
        softTotal: true,
        softBreakdown: true,
        solverMeta: true,
        generatedById: true,
        publishedById: true,
        publishedAt: true,
        createdAt: true,
        dataset: { select: { data: true } },
      },
    });
  }

  async enqueueGeneration(actor: TimetableActor, datasetId: string) {
    return this.client.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          kind: JobKind.GENERATE_TIMETABLE,
          createdById: actor.id,
          params: { datasetId },
        },
      });
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "JOB_QUEUED",
        entityType: "Job",
        entityId: job.id,
        summary: "Timetable generation was queued.",
        details: { kind: JobKind.GENERATE_TIMETABLE, datasetId },
      });
      return job;
    });
  }

  async createDraft(
    tx: Prisma.TransactionClient,
    job: { createdById: string | null; createdByRole: Role | null },
    datasetId: string,
    result: TimetableGenerationResult,
    report: DatasetValidationResult["report"],
  ): Promise<Timetable> {
    const timetable = await tx.timetable.create({
      data: {
        datasetId,
        status: PublishStatus.DRAFT,
        schedule: result.schedule,
        report,
        hardViolationCount: report.hard_violation_count,
        softTotal: result.soft_total,
        softBreakdown: result.soft_breakdown,
        ...(result.solver_meta == null
          ? {}
          : { solverMeta: result.solver_meta }),
        generatedById: job.createdById,
      },
    });

    await audit(tx, {
      actorId: job.createdById,
      actorRole: job.createdByRole,
      action: "TIMETABLE_GENERATED",
      entityType: "Timetable",
      entityId: timetable.id,
      summary: "A draft timetable was generated.",
      details: {
        datasetId,
        hardViolationCount: report.hard_violation_count,
        softTotal: result.soft_total,
      },
    });
    return timetable;
  }

  async saveValidation(
    id: string,
    actor: TimetableActor,
    validation: DatasetValidationResult,
  ) {
    return this.client.$transaction(async (tx) => {
      const existing = await tx.timetable.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!existing) throw new NotFoundError("The timetable was not found.");
      if (existing.status !== PublishStatus.DRAFT) {
        throw new ConflictError(
          "Only a draft timetable can be validated for publishing.",
          "STALE_STATE",
        );
      }

      const updated = await tx.timetable.update({
        where: { id },
        data: {
          report: validation.report,
          hardViolationCount: validation.report.hard_violation_count,
        },
        select: {
          id: true,
          hardViolationCount: true,
          report: true,
        },
      });
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "TIMETABLE_VALIDATED",
        entityType: "Timetable",
        entityId: id,
        summary: "A draft timetable was validated.",
        details: {
          hardViolationCount: validation.report.hard_violation_count,
        },
      });
      return updated;
    });
  }

  async publish(
    id: string,
    actor: TimetableActor,
    validation: DatasetValidationResult,
  ) {
    return this.client.$transaction(
      async (tx) => {
        const draft = await tx.timetable.findUnique({
          where: { id },
          select: {
            id: true,
            datasetId: true,
            status: true,
            hardViolationCount: true,
          },
        });
        if (!draft) throw new NotFoundError("The timetable was not found.");
        if (draft.status !== PublishStatus.DRAFT) {
          throw new ConflictError(
            "Only a draft timetable can be published.",
            "STALE_STATE",
          );
        }
        const activeDataset = await tx.dataset.findFirst({
          where: { isActive: true }, select: { id: true },
        });
        if (activeDataset?.id !== draft.datasetId) {
          throw new ConflictError(
            "Only a timetable generated from the active dataset can be published.",
            "STALE_DATASET",
          );
        }
        if (
          validation.report.hard_violation_count > 0 ||
          draft.hardViolationCount > 0
        ) {
          throw new ValidationError(
            "A timetable with hard violations cannot be published.",
            "SCHEDULE_RULE_VIOLATION",
            validation.report,
          );
        }

        const previous = await tx.timetable.findMany({
          where: {
            datasetId: draft.datasetId,
            status: PublishStatus.PUBLISHED,
          },
          select: { id: true },
        });
        await tx.timetable.updateMany({
          where: {
            datasetId: draft.datasetId,
            status: PublishStatus.PUBLISHED,
          },
          data: { status: PublishStatus.ARCHIVED },
        });
        for (const timetable of previous) {
          await audit(tx, {
            actorId: actor.id,
            actorRole: actor.role,
            action: "TIMETABLE_ARCHIVED",
            entityType: "Timetable",
            entityId: timetable.id,
            summary: "A previously published timetable was archived.",
            details: { replacedById: id },
          });
        }

        const published = await tx.timetable.updateMany({
          where: {
            id,
            status: PublishStatus.DRAFT,
            hardViolationCount: 0,
          },
          data: {
            status: PublishStatus.PUBLISHED,
            report: validation.report,
            hardViolationCount: 0,
            publishedById: actor.id,
            publishedAt: new Date(),
          },
        });
        if (published.count !== 1) {
          throw new ConflictError(
            "The timetable changed before it could be published.",
            "STALE_STATE",
          );
        }

        const result = await tx.timetable.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            datasetId: true,
            status: true,
            label: true,
            schedule: true,
            report: true,
            hardViolationCount: true,
            softTotal: true,
            softBreakdown: true,
            solverMeta: true,
            publishedById: true,
            publishedAt: true,
            createdAt: true,
          },
        });
        await audit(tx, {
          actorId: actor.id,
          actorRole: actor.role,
          action: "TIMETABLE_PUBLISHED",
          entityType: "Timetable",
          entityId: id,
          summary: "A timetable was published.",
          details: { datasetId: draft.datasetId },
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async deleteDraft(id: string, actor: TimetableActor) {
    return this.client.$transaction(async (tx) => {
      const draft = await tx.timetable.findUnique({
        where: { id },
        select: { id: true, status: true, datasetId: true },
      });
      if (!draft) throw new NotFoundError("The timetable was not found.");
      if (draft.status !== PublishStatus.DRAFT) {
        throw new ConflictError(
          "Only draft timetables can be deleted.",
          "STALE_STATE",
        );
      }

      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "TIMETABLE_DRAFT_DELETED",
        entityType: "Timetable",
        entityId: id,
        summary: "A draft timetable was deleted.",
        details: { datasetId: draft.datasetId },
      });
      await tx.timetable.delete({ where: { id } });
      return { id };
    });
  }
}
