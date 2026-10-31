import {
  DatasetSource,
  JobState,
  Prisma,
  PublishStatus,
  type PrismaClient,
  type Role,
} from "@prisma/client";
import { audit } from "../../audit/audit.service.js";
import { prisma } from "../../lib/prisma.js";
import { ConflictError, NotFoundError } from "../../utils/api-error.js";
import type { DatasetListQuery, DatasetUploadBody } from "./datasets.schema.js";

export type DatasetActor = { id: string; role: Role };

export class DatasetsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(query: DatasetListQuery) {
    const [items, total] = await Promise.all([
      this.client.dataset.findMany({
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          datasetKey: true,
          label: true,
          version: true,
          source: true,
          summary: true,
          isActive: true,
          parentId: true,
          uploadedById: true,
          createdAt: true,
        },
      }),
      this.client.dataset.count(),
    ]);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findActiveSummary() {
    return this.client.dataset.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        datasetKey: true,
        label: true,
        version: true,
        source: true,
        summary: true,
        createdAt: true,
      },
    });
  }

  async upload(
    actor: DatasetActor,
    input: DatasetUploadBody,
    summary: Prisma.InputJsonValue,
  ) {
    const datasetKey = input.data.dataset_id;
    if (typeof datasetKey !== "string") {
      throw new ConflictError(
        "The dataset identifier is invalid.",
        "DATASET_INVALID",
      );
    }

    return this.client.$transaction(async (tx) => {
      const previous = await tx.dataset.findFirst({
        where: { datasetKey },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const dataset = await tx.dataset.create({
        data: {
          datasetKey,
          label: input.label,
          version: (previous?.version ?? 0) + 1,
          source: DatasetSource.UPLOAD,
          data: input.data as Prisma.InputJsonObject,
          summary,
          uploadedById: actor.id,
        },
        select: {
          id: true,
          datasetKey: true,
          label: true,
          version: true,
          source: true,
          summary: true,
          isActive: true,
          createdAt: true,
        },
      });

      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "DATASET_UPLOADED",
        entityType: "Dataset",
        entityId: dataset.id,
        summary: "A validated dataset was uploaded.",
        details: { datasetKey, version: dataset.version },
      });

      return dataset;
    });
  }

  async activate(id: string, actor: DatasetActor) {
    return this.client.$transaction(
      async (tx) => {
        const dataset = await tx.dataset.findUnique({
          where: { id },
          select: {
            id: true,
            datasetKey: true,
            label: true,
            version: true,
            source: true,
            summary: true,
            isActive: true,
            createdAt: true,
          },
        });
        if (!dataset) {
          throw new NotFoundError("The dataset was not found.");
        }

        await tx.dataset.updateMany({
          where: { isActive: true, id: { not: id } },
          data: { isActive: false },
        });
        if (!dataset.isActive) {
          await tx.dataset.update({
            where: { id },
            data: { isActive: true },
          });
        }

        await audit(tx, {
          actorId: actor.id,
          actorRole: actor.role,
          action: "DATASET_ACTIVATED",
          entityType: "Dataset",
          entityId: id,
          summary: "A dataset was activated.",
          details: { datasetKey: dataset.datasetKey, version: dataset.version },
        });

        return { ...dataset, isActive: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async resetDemo(actor: DatasetActor) {
    return this.client.$transaction(
      async (tx) => {
        const latestUploaded = await tx.dataset.findFirst({
          where: { source: DatasetSource.UPLOAD },
          orderBy: [{ createdAt: "desc" }, { version: "desc" }],
          select: { id: true, datasetKey: true, version: true },
        });
        if (!latestUploaded) {
          throw new ConflictError(
            "There is no uploaded dataset to reset the demo to.",
            "NO_DATASET_TO_RESET",
          );
        }

        await tx.dataset.updateMany({
          where: { isActive: true, id: { not: latestUploaded.id } },
          data: { isActive: false },
        });
        await tx.dataset.update({
          where: { id: latestUploaded.id },
          data: { isActive: true },
        });

        const runningJobs = await tx.job.count({ where: { state: JobState.RUNNING } });
        if (runningJobs > 0) {
          throw new ConflictError(
            "Demo reset is blocked while background jobs are running. Wait for them to finish and retry.",
            "JOBS_RUNNING",
          );
        }
        const [timetables, examSchedules, jobs] = await Promise.all([
          tx.timetable.updateMany({
            where: { status: { not: PublishStatus.ARCHIVED } },
            data: { status: PublishStatus.ARCHIVED },
          }),
          tx.examSchedule.updateMany({
            where: { status: { not: PublishStatus.ARCHIVED } },
            data: { status: PublishStatus.ARCHIVED },
          }),
          tx.job.updateMany({
            where: { state: JobState.QUEUED },
            data: {
              state: JobState.FAILED,
              progress: 0,
              error: "Stopped because the demo dataset was reset.",
              finishedAt: new Date(),
            },
          }),
        ]);

        await audit(tx, {
          actorId: actor.id,
          actorRole: actor.role,
          action: "DEMO_RESET",
          entityType: "Dataset",
          entityId: latestUploaded.id,
          summary: "The demo was reset to the latest uploaded dataset.",
          details: {
            datasetKey: latestUploaded.datasetKey,
            version: latestUploaded.version,
            archivedTimetables: timetables.count,
            archivedExamSchedules: examSchedules.count,
            clearedJobs: jobs.count,
          },
        });

        return {
          dataset: latestUploaded,
          archivedTimetables: timetables.count,
          archivedExamSchedules: examSchedules.count,
          clearedJobs: jobs.count,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
