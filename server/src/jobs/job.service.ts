import { JobKind, JobState, Prisma, type Job, type Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { audit } from "../audit/audit.service.js";
import logger from "../utils/logger.js";
import { InternalServerError } from "../utils/api-error.js";

type JobRecord = Prisma.JobGetPayload<{
  include: { createdBy: { select: { role: true } } };
}>;

const jobLabel = (kind: JobKind): string => {
  switch (kind) {
    case JobKind.GENERATE_TIMETABLE:
      return "Timetable generation";
    case JobKind.GENERATE_EXAMS:
      return "Exam generation";
    case JobKind.DECIDE_BOOKINGS:
      return "Booking decisions";
    case JobKind.REPAIR:
      return "Timetable repair";
    default:
      return "Background job";
  }
};

export type JobOutcome = {
  resultType: string;
  persist: (tx: Prisma.TransactionClient, job: JobRecord) => Promise<string>;
};

export type JobHandler = (job: JobRecord) => Promise<JobOutcome>;

export class JobService {
  constructor(private readonly client = prisma) {}

  async enqueue(
    kind: JobKind,
    actor: { id: string; role: Role },
    params: Prisma.InputJsonValue,
  ): Promise<Job> {
    return this.client.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: { kind, createdById: actor.id, params },
      });

      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "JOB_QUEUED",
        entityType: "Job",
        entityId: job.id,
        summary: `${jobLabel(kind)} was queued.`,
        details: { kind },
      });

      return job;
    });
  }

  async process(jobId: string, handler: JobHandler): Promise<void> {
    let claimedJob: JobRecord | null = null;

    try {
      const activeJob = await this.claim(jobId);
      if (!activeJob) return;
      claimedJob = activeJob;

      const outcome = await handler(activeJob);
      await this.client.job.updateMany({
        where: { id: activeJob.id, state: JobState.RUNNING },
        data: { progress: 90, message: "Saving result..." },
      });
      await this.client.$transaction(async (tx) => {
        const resultId = await outcome.persist(tx, activeJob);
        await tx.job.update({
          where: { id: activeJob.id },
          data: {
            state: JobState.SUCCEEDED,
            progress: 100,
            resultType: outcome.resultType,
            resultId,
            error: null,
            finishedAt: new Date(),
          },
        });
        await audit(tx, {
          actorId: activeJob.createdById,
          actorRole: activeJob.createdBy?.role ?? null,
          action: "JOB_SUCCEEDED",
          entityType: "Job",
          entityId: activeJob.id,
          summary: `${jobLabel(activeJob.kind)} completed.`,
          details: { resultType: outcome.resultType, resultId },
        });
      });
    } catch (error) {
      logger.error(`[JOB_FAILED] ${jobId}`, error);
      if (!claimedJob) return;
      const failedJob = claimedJob;

      try {
        await this.client.$transaction(async (tx) => {
          await tx.job.updateMany({
            where: { id: failedJob.id, state: JobState.RUNNING },
            data: {
              state: JobState.FAILED,
              progress: 0,
              message: "Failed.",
              error:
                error instanceof Error
                  ? error.message
                  : `${jobLabel(failedJob.kind)} failed.`,
              finishedAt: new Date(),
            },
          });
          await audit(tx, {
            actorId: failedJob.createdById,
            actorRole: failedJob.createdBy?.role ?? null,
            action: "JOB_FAILED",
            entityType: "Job",
            entityId: failedJob.id,
            summary: `${jobLabel(failedJob.kind)} failed.`,
          });
        });
      } catch (recordingError) {
        logger.error(`[JOB_FAILURE_STATE_NOT_SAVED] ${jobId}`, recordingError);
      }
    }
  }

  async resumeQueued(kind: JobKind, handler: JobHandler): Promise<void> {
    // Recover jobs abandoned by a crashed worker. The lease is deliberately
    // conservative so a long-running live worker is not reclaimed too early.
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
    await this.client.job.updateMany({
      where: {
        kind,
        state: JobState.RUNNING,
        startedAt: { lt: staleBefore },
      },
      data: {
        state: JobState.QUEUED,
        progress: 0,
        message: "Recovered after worker restart.",
        startedAt: null,
      },
    });
    const queuedJobs = await this.client.job.findMany({
      where: { kind, state: JobState.QUEUED },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    // Bound parallel solver calls to avoid saturating the Python service/DB.
    const concurrency = 2;
    for (let index = 0; index < queuedJobs.length; index += concurrency) {
      await Promise.all(
        queuedJobs
          .slice(index, index + concurrency)
          .map(({ id }) => this.process(id, handler)),
      );
    }
  }

  private async claim(jobId: string): Promise<JobRecord | null> {
    return this.client.$transaction(async (tx) => {
      const claimed = await tx.job.updateMany({
        where: { id: jobId, state: JobState.QUEUED },
        data: {
          state: JobState.RUNNING,
          progress: 5,
          message: "Processing...",
          startedAt: new Date(),
        },
      });
      if (claimed.count !== 1) return null;

      const job = await tx.job.findUnique({
        where: { id: jobId },
        include: { createdBy: { select: { role: true } } },
      });
      if (!job) {
        throw new InternalServerError(
          "A queued job disappeared while it was being claimed.",
        );
      }

      await audit(tx, {
        actorId: job.createdById,
        actorRole: job.createdBy?.role ?? null,
        action: "JOB_STARTED",
        entityType: "Job",
        entityId: job.id,
        summary: `${jobLabel(job.kind)} started.`,
      });
      return job;
    });
  }
}

export const jobService = new JobService();
