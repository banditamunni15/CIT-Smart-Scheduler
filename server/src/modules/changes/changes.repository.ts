import {
  ChangeSource,
  ChangeStatus,
  DatasetSource,
  JobKind,
  Prisma,
  PublishStatus,
  Role,
  type PrismaClient,
} from "@prisma/client";
import { audit } from "../../audit/audit.service.js";
import { prisma } from "../../lib/prisma.js";
import { ConflictError, NotFoundError } from "../../utils/api-error.js";
import type { Disruption } from "./changes.schema.js";

export type ChangeActor = { id: string; role: Role; department: string | null };
export type ChangeCreateInput = {
  source: ChangeSource;
  requestedById: string;
  baseDatasetId: string;
  baseTimetableId: string;
  disruption: Disruption;
  originalText?: string;
};

const isJsonRecord = (value: unknown): value is Prisma.JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class ChangesRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  findActiveBase() {
    return this.client.dataset.findFirst({
      where: { isActive: true },
      select: {
        id: true,
        datasetKey: true,
        label: true,
        version: true,
        data: true,
        summary: true,
      },
    });
  }

  findPublishedTimetable(datasetId: string) {
    return this.client.timetable.findFirst({
      where: { datasetId, status: PublishStatus.PUBLISHED },
      orderBy: { publishedAt: "desc" },
      select: { id: true, schedule: true },
    });
  }

  findById(id: string) {
    return this.client.changeProposal.findUnique({
      where: { id },
      include: {
        requestedBy: {
          select: {
            id: true,
            name: true,
            role: true,
            department: true,
            facultyId: true,
          },
        },
        baseDataset: { select: { id: true, datasetKey: true, version: true } },
      },
    });
  }

  list(actor: ChangeActor, statuses?: ChangeStatus[]) {
    return this.client.changeProposal.findMany({
      where: {
        ...(actor.role === Role.ADMIN
          ? {}
          : actor.role === Role.COORDINATOR && actor.department
            ? { requestedBy: { department: actor.department } }
            : { requestedById: actor.id }),
        ...(statuses?.length ? { status: { in: statuses } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        requestedBy: {
          select: {
            id: true,
            name: true,
            role: true,
            department: true,
            facultyId: true,
          },
        },
      },
    });
  }

  async createQueued(
    actor: ChangeActor,
    input: ChangeCreateInput,
  ): Promise<{ change: { id: string }; jobId: string }> {
    return this.client.$transaction(async (tx) => {
      const change = await tx.changeProposal.create({
        data: {
          source: input.source,
          status: ChangeStatus.SUBMITTED,
          baseDatasetId: input.baseDatasetId,
          baseTimetableId: input.baseTimetableId,
          requestedById: input.requestedById,
          disruption: input.disruption as Prisma.InputJsonObject,
          ...(input.originalText === undefined
            ? {}
            : { originalText: input.originalText }),
        },
        select: { id: true },
      });
      const job = await tx.job.create({
        data: {
          kind: JobKind.REPAIR,
          createdById: actor.id,
          params: {
            changeId: change.id,
            datasetId: input.baseDatasetId,
            timetableId: input.baseTimetableId,
          },
        },
      });
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "CHANGE_SUBMITTED",
        entityType: "ChangeProposal",
        entityId: change.id,
        summary: "A timetable change proposal was submitted.",
        details: { source: input.source, jobId: job.id },
      });
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "JOB_QUEUED",
        entityType: "Job",
        entityId: job.id,
        summary: "Timetable repair was queued.",
        details: { kind: JobKind.REPAIR, changeId: change.id },
      });
      return { change, jobId: job.id };
    });
  }

  async saveRepair(
    tx: Prisma.TransactionClient,
    changeId: string,
    result:
      | {
          status: "PROPOSED";
          proposedSchedule: Prisma.InputJsonValue;
          diff: Prisma.InputJsonValue;
          movedCount: number;
          timeChangedCount: number;
          roomOnlyCount: number;
          report: Prisma.InputJsonValue;
        }
      | {
          status: "IMPOSSIBLE";
          conflicts: Prisma.InputJsonValue;
          explanation: string;
        },
    actor: { id: string | null; role: Role | null },
  ) {
    const updated = await tx.changeProposal.updateMany({
      where: { id: changeId, status: ChangeStatus.SUBMITTED },
      data:
        result.status === "PROPOSED"
          ? {
              status: ChangeStatus.PROPOSED,
              proposedSchedule: result.proposedSchedule,
              diff: result.diff,
              movedCount: result.movedCount,
              timeChangedCount: result.timeChangedCount,
              roomOnlyCount: result.roomOnlyCount,
              report: result.report,
            }
          : {
              status: ChangeStatus.IMPOSSIBLE,
              conflicts: result.conflicts,
              explanation: result.explanation,
            },
    });
    if (updated.count !== 1) {
      throw new ConflictError(
        "The change proposal was withdrawn or already processed.",
        "STALE_STATE",
      );
    }
    await audit(tx, {
      actorId: actor.id,
      actorRole: actor.role,
      action:
        result.status === "PROPOSED" ? "CHANGE_PROPOSED" : "CHANGE_IMPOSSIBLE",
      entityType: "ChangeProposal",
      entityId: changeId,
      summary:
        result.status === "PROPOSED"
          ? "The engine proposed a repaired timetable."
          : "The engine could not repair the timetable.",
    });
    return changeId;
  }

  async approve(
    id: string,
    actor: ChangeActor,
    data: Prisma.InputJsonObject,
    schedule: Prisma.InputJsonObject,
    report: Prisma.InputJsonValue,
  ) {
    return this.client.$transaction(
      async (tx) => {
        const change = await tx.changeProposal.findUnique({
          where: { id },
          include: {
            requestedBy: {
              select: { id: true, role: true, department: true },
            },
            baseDataset: {
              select: {
                id: true,
                datasetKey: true,
                label: true,
                version: true,
              },
            },
            baseTimetable: {
              select: { id: true, status: true, schedule: true },
            },
          },
        });
        if (!change)
          throw new NotFoundError("The change proposal was not found.");
        if (
          change.status !== ChangeStatus.PROPOSED &&
          change.status !== ChangeStatus.DEPT_APPROVED
        ) {
          throw new ConflictError(
            "The change proposal is no longer awaiting approval.",
            "STALE_STATE",
          );
        }
        const [activeDataset, published] = await Promise.all([
          tx.dataset.findFirst({
            where: { isActive: true },
            select: { id: true },
          }),
          tx.timetable.findFirst({
            where: {
              status: PublishStatus.PUBLISHED,
              datasetId: change.baseDatasetId,
            },
            orderBy: { publishedAt: "desc" },
            select: { id: true },
          }),
        ]);
        if (
          activeDataset?.id !== change.baseDatasetId ||
          published?.id !== change.baseTimetableId ||
          change.baseTimetable.status !== PublishStatus.PUBLISHED
        ) {
          throw new ConflictError(
            "The base timetable is no longer the published timetable.",
            "STALE_STATE",
          );
        }

        const latest = await tx.dataset.findFirst({
          where: { datasetKey: change.baseDataset.datasetKey },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const dataset = await tx.dataset.create({
          data: {
            datasetKey: change.baseDataset.datasetKey,
            label: change.baseDataset.label,
            version: (latest?.version ?? change.baseDataset.version) + 1,
            source: DatasetSource.CHANGE_APPLIED,
            parentId: change.baseDatasetId,
            uploadedById: actor.id,
            data,
            summary: change.baseDataset.label
              ? { source: "CHANGE_APPLIED", changeId: id }
              : {},
            isActive: false,
          },
          select: { id: true },
        });
        await tx.dataset.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        });
        await tx.dataset.update({
          where: { id: dataset.id },
          data: { isActive: true },
        });

        const archived = await tx.timetable.updateMany({
          where: {
            id: change.baseTimetableId,
            status: PublishStatus.PUBLISHED,
          },
          data: { status: PublishStatus.ARCHIVED },
        });
        if (archived.count !== 1) {
          throw new ConflictError(
            "The base timetable changed before approval.",
            "STALE_STATE",
          );
        }
        const timetable = await tx.timetable.create({
          data: {
            datasetId: dataset.id,
            status: PublishStatus.PUBLISHED,
            schedule,
            report,
            hardViolationCount: 0,
            softTotal: isJsonRecord(report) && typeof report.soft_total === "number" ? report.soft_total : 0,
            softBreakdown: isJsonRecord(report) && isJsonRecord(report.soft_penalties) ? report.soft_penalties : {},
            parentId: change.baseTimetableId,
            publishedById: actor.id,
            publishedAt: new Date(),
          },
          select: { id: true },
        });
        await tx.changeProposal.update({
          where: { id },
          data: {
            status: ChangeStatus.APPROVED,
            resultDatasetId: dataset.id,
            resultTimetableId: timetable.id,
            reviewedById: actor.id,
            reviewedAt: new Date(),
          },
        });
        await audit(tx, {
          actorId: actor.id,
          actorRole: actor.role,
          action: "CHANGE_APPROVED",
          entityType: "ChangeProposal",
          entityId: id,
          summary: "A timetable change was approved and applied.",
          details: {
            resultDatasetId: dataset.id,
            resultTimetableId: timetable.id,
          },
        });
        await audit(tx, {
          actorId: actor.id,
          actorRole: actor.role,
          action: "TIMETABLE_PUBLISHED",
          entityType: "Timetable",
          entityId: timetable.id,
          summary: "A repaired timetable was published.",
          details: { datasetId: dataset.id, parentId: change.baseTimetableId },
        });
        return { id, datasetId: dataset.id, timetableId: timetable.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async review(
    id: string,
    actor: ChangeActor,
    status: typeof ChangeStatus.APPROVED | typeof ChangeStatus.REJECTED,
    note?: string,
  ) {
    return this.client.$transaction(async (tx) => {
      const change = await tx.changeProposal.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!change)
        throw new NotFoundError("The change proposal was not found.");
      if (
        change.status !== ChangeStatus.PROPOSED &&
        change.status !== ChangeStatus.DEPT_APPROVED
      ) {
        throw new ConflictError(
          "The change proposal is no longer awaiting review.",
          "STALE_STATE",
        );
      }
      const changed = await tx.changeProposal.updateMany({
        where: {
          id,
          status: {
            in: [ChangeStatus.PROPOSED, ChangeStatus.DEPT_APPROVED],
          },
        },
        data: {
          status,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          reviewNote: note ?? null,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictError("The change proposal changed.", "STALE_STATE");
      }
      const updated = await tx.changeProposal.findUniqueOrThrow({
        where: { id },
        select: { id: true, status: true, reviewNote: true },
      });
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action:
          status === ChangeStatus.REJECTED
            ? "CHANGE_REJECTED"
            : "CHANGE_APPROVED",
        entityType: "ChangeProposal",
        entityId: id,
        summary:
          status === ChangeStatus.REJECTED
            ? "A timetable change proposal was rejected."
            : "A timetable change proposal was approved.",
        ...(note ? { details: { note } } : {}),
      });
      return updated;
    });
  }

  async deptApprove(id: string, actor: ChangeActor) {
    return this.client.$transaction(async (tx) => {
      const change = await tx.changeProposal.findUnique({
        where: { id },
        include: {
          requestedBy: { select: { id: true, role: true, department: true } },
        },
      });
      if (!change)
        throw new NotFoundError("The change proposal was not found.");
      if (
        change.status !== ChangeStatus.PROPOSED ||
        change.requestedBy.role !== Role.FACULTY ||
        change.requestedBy.department !== actor.department
      ) {
        throw new ConflictError(
          "The change proposal is not eligible for department approval.",
          "STALE_STATE",
        );
      }
      if (change.requestedById === actor.id) {
        throw new ConflictError(
          "A requester cannot approve their own change.",
          "SELF_APPROVAL_NOT_ALLOWED",
        );
      }
      const result = await tx.changeProposal.updateMany({
        where: { id, status: ChangeStatus.PROPOSED },
        data: {
          status: ChangeStatus.DEPT_APPROVED,
          deptApprovedById: actor.id,
          deptApprovedAt: new Date(),
        },
      });
      if (result.count !== 1) {
        throw new ConflictError("The change proposal changed.", "STALE_STATE");
      }
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "CHANGE_DEPARTMENT_APPROVED",
        entityType: "ChangeProposal",
        entityId: id,
        summary: "A coordinator approved a faculty change proposal.",
      });
      return { id, status: ChangeStatus.DEPT_APPROVED };
    });
  }

  async withdraw(id: string, actor: ChangeActor) {
    return this.client.$transaction(async (tx) => {
      const change = await tx.changeProposal.findUnique({
        where: { id },
        select: { id: true, requestedById: true, status: true },
      });
      if (!change || change.requestedById !== actor.id) {
        throw new NotFoundError("The change proposal was not found.");
      }
      if (change.status !== ChangeStatus.SUBMITTED) {
        throw new ConflictError(
          "A change proposal cannot be withdrawn after the engine has decided it.",
          "STALE_STATE",
        );
      }
      const changed = await tx.changeProposal.updateMany({
        where: { id, status: ChangeStatus.SUBMITTED },
        data: { status: ChangeStatus.WITHDRAWN },
      });
      if (changed.count !== 1) {
        throw new ConflictError(
          "A change proposal cannot be withdrawn after the engine has decided it.",
          "STALE_STATE",
        );
      }
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "CHANGE_WITHDRAWN",
        entityType: "ChangeProposal",
        entityId: id,
        summary: "A change proposal was withdrawn before a decision.",
      });
      return { id, status: ChangeStatus.WITHDRAWN };
    });
  }
}

export const changesRepository = new ChangesRepository();
