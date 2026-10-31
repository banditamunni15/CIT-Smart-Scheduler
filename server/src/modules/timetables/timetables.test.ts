import express, { type RequestHandler } from "express";
import request from "supertest";
import {
  JobKind,
  JobState,
  PublishStatus,
  Role,
  type Prisma,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { MockEngine } from "../../lib/engine/index.js";
import type { EngineClient } from "../../lib/engine/index.js";
import { JobService, type JobHandler } from "../../jobs/job.service.js";
import errorHandler from "../../middlewares/error-handler.js";
import notFound from "../../middlewares/not-found.js";
import { UnauthorizedError } from "../../utils/api-error.js";
import type { RequestUser } from "../../types/express.js";
import { createPublicTimetablesRouter } from "./timetables.public.routes.js";
import { createTimetablesRouter } from "./timetables.routes.js";
import { TimetablesService } from "./timetables.service.js";
import type { TimetablesRepository } from "./timetables.repository.js";

const createdAt = new Date("2026-10-31T00:00:00.000Z");
const dataset = {
  dataset_id: "cit-test",
  sessions: [
    {
      session_id: "S1",
      group_ids: ["G1"],
      faculty_id: "F1",
      duration_periods: 2,
    },
  ],
  groups: [{ group_id: "G1", name: "Group 1" }],
  faculty: [{ faculty_id: "F1", department: "CSE" }],
  rooms: [
    { room_id: "R1", capacity: 30, type: "CLASSROOM" },
    { room_id: "R2", capacity: 40, type: "CLASSROOM" },
  ],
};
const schedule = {
  sessions: [{ session_id: "S1", day: "MON", start_period: 2, room_id: "R1" }],
};
const report = { hard_violation_count: 0 };
const timetable: NonNullable<
  Awaited<ReturnType<TimetablesRepository["findById"]>>
> = {
  id: "timetable-1",
  datasetId: "dataset-1",
  status: PublishStatus.PUBLISHED,
  label: null,
  schedule,
  report,
  hardViolationCount: 0,
  softTotal: 0,
  softBreakdown: {},
  solverMeta: null,
  generatedById: null,
  publishedById: "admin-1",
  publishedAt: createdAt,
  createdAt,
  dataset: { data: dataset },
};

const makeRepository = (): Pick<
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
> => ({
  findActiveDataset: vi.fn(async () => ({ id: "dataset-1", data: dataset })),
  findDatasetById: vi.fn(async () => ({ id: "dataset-1", data: dataset })),
  findPriorityOrder: vi.fn(async () => null),
  list: vi.fn(async (query) => ({
    items: [],
    total: 0,
    page: query.page,
    limit: query.limit,
  })),
  findById: vi.fn(async () => timetable),
  findPublishedForActiveDataset: vi.fn(async () => timetable),
  enqueueGeneration: vi.fn(async () => ({
    id: "job-1",
    kind: JobKind.GENERATE_TIMETABLE,
    state: JobState.QUEUED,
    progress: 0,
    message: null,
    params: { datasetId: "dataset-1" },
    resultType: null,
    resultId: null,
    error: null,
    createdById: "admin-1",
    startedAt: null,
    finishedAt: null,
    createdAt,
  })),
  createDraft: vi.fn(async () => {
    throw new Error("createDraft should not be called");
  }),
  saveValidation: vi.fn(async () => ({
    id: "timetable-1",
    report,
    hardViolationCount: 0,
  })),
  publish: vi.fn(async () => timetable),
  deleteDraft: vi.fn(async (id) => ({ id })),
});

const makeService = (): TimetablesService =>
  new TimetablesService(
    makeRepository(),
    {
      generateTimetable: vi.fn(async () => ({
        schedule,
        report,
        soft_total: 0,
        soft_breakdown: {},
      })),
      validateSchedule: vi.fn(async () => ({ report })),
    },
    {
      process: vi.fn(async () => undefined),
      resumeQueued: vi.fn(async () => undefined),
    },
  );

const makeApp = (
  service: TimetablesService,
  actor: RequestUser,
): express.Express => {
  const app = express();
  app.use(express.json());
  const authenticate: RequestHandler = (req, _res, next) => {
    if (!actor) {
      next(new UnauthorizedError("Authentication is required."));
      return;
    }
    req.user = actor;
    next();
  };
  app.use("/api/timetables", createTimetablesRouter(service, authenticate));
  app.use("/api/public", createPublicTimetablesRouter(service));
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

const admin: RequestUser = {
  id: "admin-1",
  role: Role.ADMIN,
  department: null,
  facultyId: null,
  clubName: null,
};

describe("timetable routes", () => {
  it("queues generation with a job id", async () => {
    const service = makeService();
    const response = await request(makeApp(service, admin)).post(
      "/api/timetables/generate",
    );

    expect(response.status).toBe(202);
    expect(response.body.data).toEqual({ jobId: "job-1" });
  });

  it("returns paginated timetable metadata to admins", async () => {
    const service = makeService();
    const response = await request(makeApp(service, admin)).get(
      "/api/timetables?page=2&limit=10",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      items: [],
      total: 0,
      page: 2,
      limit: 10,
    });
  });

  it("rejects non-admin users from admin timetable routes", async () => {
    const service = makeService();
    const response = await request(
      makeApp(service, { ...admin, role: Role.FACULTY, facultyId: "F1" }),
    ).get("/api/timetables");

    expect(response.status).toBe(403);
  });

  it("returns a public group timetable without authentication", async () => {
    const service = makeService();
    const response = await request(makeApp(service, admin)).get(
      "/api/public/timetable/group/G1",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      {
        session_id: "S1",
        group_ids: ["G1"],
        faculty_id: "F1",
        duration_periods: 2,
        day: "MON",
        start_period: 2,
        room_id: "R1",
        room: { room_id: "R1", capacity: 30, type: "CLASSROOM" },
      },
    ]);
  });

  it("does not include the full dataset in the published timetable response", async () => {
    const service = makeService();
    const response = await request(makeApp(service, admin)).get(
      "/api/timetables/published",
    );

    expect(response.status).toBe(200);
    expect(response.body.data.dataset).toBeUndefined();
    expect(response.body.data.schedule).toEqual(schedule);
  });

  it("validates public free-room query parameters", async () => {
    const service = makeService();
    const response = await request(makeApp(service, admin)).get(
      "/api/public/free-rooms?day=SAT&period=0",
    );

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns free rooms with filters and respects occupied session duration", async () => {
    const service = makeService();
    const response = await request(makeApp(service, admin)).get(
      "/api/public/free-rooms?day=MON&period=3&capacity=35&type=CLASSROOM",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { room_id: "R2", capacity: 40, type: "CLASSROOM" },
    ]);
  });
});

describe("timetable generation", () => {
  it("does not save a generated timetable when validation reports hard violations", async () => {
    let capturedHandler: JobHandler | undefined;
    const repository = makeRepository();
    const generationJob = {
      id: "job-1",
      kind: JobKind.GENERATE_TIMETABLE,
      state: JobState.QUEUED,
      progress: 0,
      message: null,
      params: { datasetId: "dataset-1" },
      resultType: null,
      resultId: null,
      error: null,
      createdById: "admin-1",
      startedAt: null,
      finishedAt: null,
      createdAt,
      createdBy: { role: Role.ADMIN },
    } satisfies Prisma.JobGetPayload<{
      include: { createdBy: { select: { role: true } } };
    }>;
    const jobs: Pick<JobService, "process" | "resumeQueued"> = {
      process: vi.fn(async (_jobId, handler) => {
        capturedHandler = handler;
      }),
      resumeQueued: vi.fn(async () => undefined),
    };
    const engine: Pick<EngineClient, "generateTimetable" | "validateSchedule"> =
      new MockEngine(
        undefined,
        { report: { hard_violation_count: 1, violations: ["collision"] } },
        { schedule, report, soft_total: 0, soft_breakdown: {} },
      );
    const service = new TimetablesService(repository, engine, jobs);

    await service.generate({ id: "admin-1", role: Role.ADMIN });
    await expect(capturedHandler?.(generationJob)).rejects.toMatchObject({
      code: "SCHEDULE_RULE_VIOLATION",
    });
    expect(repository.createDraft).not.toHaveBeenCalled();
  });

  it("revalidates a draft before publishing", async () => {
    const repository = makeRepository();
    repository.findById = vi.fn(async () => ({
      ...timetable,
      status: PublishStatus.DRAFT,
    }));
    const engine: Pick<EngineClient, "generateTimetable" | "validateSchedule"> =
      new MockEngine(undefined, { report }, undefined);
    const service = new TimetablesService(repository, engine, {
      process: vi.fn(async () => undefined),
      resumeQueued: vi.fn(async () => undefined),
    });

    await service.publish("timetable-1", {
      id: "admin-1",
      role: Role.ADMIN,
    });

    expect(repository.publish).toHaveBeenCalledWith(
      "timetable-1",
      {
        id: "admin-1",
        role: Role.ADMIN,
      },
      { report },
    );
  });

  it("does not expose faculty timetables outside the faculty member's scope", async () => {
    const repository = makeRepository();
    const service = new TimetablesService(
      repository,
      new MockEngine(undefined, { report }, undefined),
      {
        process: vi.fn(async () => undefined),
        resumeQueued: vi.fn(async () => undefined),
      },
    );

    await expect(
      service.getFacultyView("F2", {
        id: "faculty-1",
        role: Role.FACULTY,
        department: "CSE",
        facultyId: "F1",
        clubName: null,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.findPublishedForActiveDataset).not.toHaveBeenCalled();
  });
});
