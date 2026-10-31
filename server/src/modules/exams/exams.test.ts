import express, { type Request, type RequestHandler } from "express";
import request from "supertest";
import {
  JobKind,
  JobState,
  PublishStatus,
  Role,
  type Prisma,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockEngine } from "../../lib/engine/index.js";
import { JobService, type JobHandler } from "../../jobs/job.service.js";
import errorHandler from "../../middlewares/error-handler.js";
import notFound from "../../middlewares/not-found.js";
import { createExamsRouter } from "./exams.routes.js";
import { createPublicExamsRouter } from "./exams.public.routes.js";
import { ExamsService } from "./exams.service.js";
import type { ExamsRepository } from "./exams.repository.js";
import { ConflictError, UnauthorizedError } from "../../utils/api-error.js";

type TestService = Pick<
  ExamsService,
  | "generate"
  | "list"
  | "getById"
  | "getPublished"
  | "publish"
  | "getPublishedForGroup"
>;

const createdAt = new Date("2026-10-31T00:00:00.000Z");
const examSchedule = {
  id: "exam-schedule-1",
  datasetId: "dataset-1",
  status: PublishStatus.PUBLISHED,
  exams: [
    {
      exam_id: "exam-1",
      course: "CS101",
      group_ids: ["G1"],
      day: "MON",
      session: "AM",
      rooms: ["R1"],
    },
  ],
  report: { hard_violation_count: 0, soft_penalty: 3 },
  hardViolationCount: 0,
  softPenalty: 3,
  publishedAt: createdAt,
  createdAt,
} satisfies Awaited<ReturnType<ExamsService["getPublished"]>>;

const examScheduleDetail = {
  ...examSchedule,
  generatedById: null,
} satisfies Awaited<ReturnType<ExamsService["getById"]>>;

const makeService = (): TestService => ({
  generate: vi.fn(async () => ({ jobId: "job-1" })),
  list: vi.fn(async ({ page, limit }) => ({
    items: [],
    total: 0,
    page,
    limit,
  })),
  getById: vi.fn(async () => examScheduleDetail),
  getPublished: vi.fn(async () => examSchedule),
  publish: vi.fn(async () => examSchedule),
  getPublishedForGroup: vi.fn(async (groupId) =>
    groupId === "G1"
      ? [
          {
            exam_id: "exam-1",
            course: "CS101",
            day: "MON",
            session: "AM" as const,
            rooms: ["R1"],
          },
        ]
      : [],
  ),
});

let actor: Request["user"];
let service: TestService;
let app: express.Express;

const testAuthentication: RequestHandler = (req, _res, next) => {
  if (!actor) {
    next(new UnauthorizedError("Authentication is required."));
    return;
  }
  req.user = actor;
  next();
};

const setupApp = (): void => {
  app = express();
  app.use(express.json());
  app.use("/api/exams", createExamsRouter(service, testAuthentication));
  app.use("/api/public/exams", createPublicExamsRouter(service));
  app.use(notFound);
  app.use(errorHandler);
};

describe("exam API", () => {
  beforeEach(() => {
    actor = {
      id: "admin-1",
      role: Role.ADMIN,
      department: null,
      facultyId: null,
      clubName: null,
    };
    service = makeService();
    setupApp();
  });

  it("queues exam generation and returns 202 with a job id", async () => {
    const response = await request(app).post("/api/exams/generate");

    expect(response.status).toBe(202);
    expect(response.body.data).toEqual({ jobId: "job-1" });
    expect(service.generate).toHaveBeenCalledWith({
      id: "admin-1",
      role: Role.ADMIN,
    });
  });

  it("returns paginated exam schedules without report or exam JSON", async () => {
    const response = await request(app).get("/api/exams?page=2&limit=10");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      items: [],
      total: 0,
      page: 2,
      limit: 10,
    });
    expect(service.list).toHaveBeenCalledWith({ page: 2, limit: 10 });
  });

  it("rejects a non-admin from admin exam routes", async () => {
    actor = {
      id: "faculty-1",
      role: Role.FACULTY,
      department: null,
      facultyId: null,
      clubName: null,
    };

    const response = await request(app).get("/api/exams");

    expect(response.status).toBe(403);
    expect(service.list).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests to private exam routes", async () => {
    actor = undefined;

    const response = await request(app).post("/api/exams/generate");

    expect(response.status).toBe(401);
    expect(service.generate).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid pagination", async () => {
    const response = await request(app).get("/api/exams?limit=101");

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("includes the report in an admin exam detail response", async () => {
    const response = await request(app).get("/api/exams/exam-schedule-1");

    expect(response.status).toBe(200);
    expect(response.body.data.report).toEqual({
      hard_violation_count: 0,
      soft_penalty: 3,
    });
  });

  it("allows any authenticated role to view the published schedule", async () => {
    actor = {
      id: "faculty-1",
      role: Role.FACULTY,
      department: null,
      facultyId: null,
      clubName: null,
    };

    const response = await request(app).get("/api/exams/published");

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe("exam-schedule-1");
  });

  it("publishes an exam schedule through the service", async () => {
    const response = await request(app).post(
      "/api/exams/exam-schedule-1/publish",
    );

    expect(response.status).toBe(200);
    expect(service.publish).toHaveBeenCalledWith("exam-schedule-1", {
      id: "admin-1",
      role: Role.ADMIN,
    });
  });

  it("rejects non-admin users from publishing exam schedules", async () => {
    actor = {
      id: "faculty-1",
      role: Role.FACULTY,
      department: null,
      facultyId: null,
      clubName: null,
    };

    const response = await request(app).post(
      "/api/exams/exam-schedule-1/publish",
    );

    expect(response.status).toBe(403);
    expect(service.publish).not.toHaveBeenCalled();
  });

  it("serves a public group view with only the requested exam fields", async () => {
    const response = await request(app).get("/api/public/exams/group/G1");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      {
        exam_id: "exam-1",
        course: "CS101",
        day: "MON",
        session: "AM",
        rooms: ["R1"],
      },
    ]);
  });
});

describe("exam generation", () => {
  it("passes the published timetable to the engine and persists a valid draft", async () => {
    let capturedHandler: JobHandler | undefined;
    const generationJob = {
      id: "job-1",
      kind: JobKind.GENERATE_EXAMS,
      state: JobState.QUEUED,
      progress: 0,
      message: null,
      params: {
        datasetId: "dataset-1",
        publishedTimetableId: "timetable-1",
      },
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
    const exams = [
      {
        exam_id: "exam-1",
        course: "CS101",
        group_ids: ["G1"],
        day: "MON",
        session: "AM",
        rooms: ["R1"],
      },
    ];
    const repository: Pick<
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
    > = {
      findActiveDataset: vi.fn(async () => ({
        id: "dataset-1",
        data: { dataset_id: "cit-test" },
      })),
      findDatasetById: vi.fn(async () => ({
        id: "dataset-1",
        data: { dataset_id: "cit-test" },
      })),
      findPriorityOrder: vi.fn(async () => ({
        value: ["COURSE_PRIORITY"],
      })),
      findPublishedTimetable: vi.fn(async () => ({
        id: "timetable-1",
        schedule: { sessions: [] },
      })),
      findTimetableById: vi.fn(async () => ({
        id: "timetable-1",
        schedule: { sessions: [] },
      })),
      list: vi.fn(async (page, limit) => ({
        items: [],
        total: 0,
        page,
        limit,
      })),
      findById: vi.fn(async () => examScheduleDetail),
      findPublished: vi.fn(async () => examSchedule),
      createDraft: vi.fn(async () => examSchedule as never),
      publish: vi.fn(async () => examSchedule),
    };
    const jobs: Pick<JobService, "enqueue" | "process" | "resumeQueued"> = {
      enqueue: vi.fn(async () => generationJob),
      process: vi.fn(async (_jobId, handler) => {
        capturedHandler = handler;
      }),
      resumeQueued: vi.fn(async () => undefined),
    };
    const engine = new MockEngine({
      exams,
      report: { hard_violation_count: 0, soft_penalty: 2 },
    });
    const examService = new ExamsService(repository, engine, jobs);

    await examService.generate({ id: "admin-1", role: Role.ADMIN });
    const outcome = await capturedHandler?.(generationJob);
    expect(outcome).toBeDefined();
    await outcome?.persist({} as Prisma.TransactionClient, generationJob);

    expect(repository.findTimetableById).toHaveBeenCalledWith(
      "dataset-1",
      "timetable-1",
    );
    expect(repository.createDraft).toHaveBeenCalledWith(
      {},
      { createdById: "admin-1", createdByRole: Role.ADMIN },
      "dataset-1",
      { exams, report: { hard_violation_count: 0, soft_penalty: 2 } },
    );
  });

  it("fails closed and does not persist schedules with hard violations", async () => {
    let capturedHandler: JobHandler | undefined;
    const generationJob = {
      id: "job-1",
      kind: JobKind.GENERATE_EXAMS,
      state: JobState.QUEUED,
      progress: 0,
      message: null,
      params: { datasetId: "dataset-1", publishedTimetableId: null },
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
    const repository: Pick<
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
    > = {
      findActiveDataset: vi.fn(async () => ({
        id: "dataset-1",
        data: { dataset_id: "cit-test" },
      })),
      findDatasetById: vi.fn(async () => ({
        id: "dataset-1",
        data: { dataset_id: "cit-test" },
      })),
      findPriorityOrder: vi.fn(async () => null),
      findPublishedTimetable: vi.fn(async () => null),
      findTimetableById: vi.fn(async () => null),
      list: vi.fn(async (page, limit) => ({
        items: [],
        total: 0,
        page,
        limit,
      })),
      findById: vi.fn(async () => examScheduleDetail),
      findPublished: vi.fn(async () => examSchedule),
      createDraft: vi.fn(async () => {
        throw new Error("createDraft should not be called");
      }),
      publish: vi.fn(async () => examSchedule),
    };
    const jobs: Pick<JobService, "enqueue" | "process" | "resumeQueued"> = {
      enqueue: vi.fn(async () => generationJob),
      process: vi.fn(async (_jobId, handler) => {
        capturedHandler = handler;
      }),
      resumeQueued: vi.fn(async () => undefined),
    };
    const engine = new MockEngine({
      exams: [],
      report: { hard_violation_count: 2, soft_penalty: 0 },
    });
    const examService = new ExamsService(repository, engine, jobs);

    await examService.generate({ id: "admin-1", role: Role.ADMIN });
    expect(capturedHandler).toBeDefined();
    await expect(capturedHandler?.(generationJob)).rejects.toMatchObject({
      code: "SCHEDULE_RULE_VIOLATION",
    });
    expect(repository.createDraft).not.toHaveBeenCalled();
  });

  it("rejects public schedule reads when nothing has been published", async () => {
    const repository = {
      findActiveDataset: vi.fn(async () => null),
      findDatasetById: vi.fn(async () => null),
      findPriorityOrder: vi.fn(async () => null),
      findPublishedTimetable: vi.fn(async () => null),
      findTimetableById: vi.fn(async () => null),
      list: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
      findById: vi.fn(async () => null),
      findPublished: vi.fn(async () => null),
      createDraft: vi.fn(async () => {
        throw new Error("Not implemented in this test repository");
      }),
      publish: vi.fn(async () => examSchedule),
    } satisfies Pick<
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
    >;
    const examService = new ExamsService(
      repository,
      new MockEngine({
        exams: [],
        report: { hard_violation_count: 0, soft_penalty: 0 },
      }),
    );

    await expect(examService.getPublished()).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});
