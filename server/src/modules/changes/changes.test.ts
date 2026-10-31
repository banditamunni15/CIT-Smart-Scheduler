import express, { type RequestHandler } from "express";
import request from "supertest";
import {
  ChangeSource,
  ChangeStatus,
  JobKind,
  JobState,
  PublishStatus,
  Role,
  type Prisma,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { RequestUser } from "../../types/express.js";
import type { JobHandler } from "../../jobs/job.service.js";
import type { EngineClient } from "../../lib/engine/index.js";
import { ForbiddenError } from "../../utils/api-error.js";
import { ChangesRepository } from "./changes.repository.js";
import { createChangesRouter } from "./changes.routes.js";
import { applyDisruption, ChangesService } from "./changes.service.js";
import { disruptionSchema, type Disruption } from "./changes.schema.js";
import type { ChangesControllerService } from "./changes.controller.js";
import errorHandler from "../../middlewares/error-handler.js";
import notFound from "../../middlewares/not-found.js";

const now = new Date("2026-10-31T12:00:00.000Z");
const dataset = {
  dataset_id: "cit-demo",
  faculty: [{ faculty_id: "F1", department: "CSE" }],
  rooms: [{ room_id: "R1" }],
  sessions: [{ session_id: "S1", faculty_id: "F1", duration_periods: 1 }],
};
const schedule = {
  sessions: [{ session_id: "S1", day: "MON", start_period: 1, room_id: "R1" }],
};
const disruption: Disruption = {
  changes: [
    {
      type: "room_unavailable",
      room_id: "R1",
      days: ["MON"],
      reason: "Maintenance",
      keep_unknown_property: "preserved",
    },
  ],
  extra_metadata: "preserved",
};
const admin: RequestUser = {
  id: "admin-1",
  role: Role.ADMIN,
  department: null,
  facultyId: null,
  clubName: null,
};
const faculty: RequestUser = {
  id: "faculty-1",
  role: Role.FACULTY,
  department: "CSE",
  facultyId: "F1",
  clubName: null,
};

const changeRecord = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "change-1",
    source: ChangeSource.ADMIN_FORM,
    status: ChangeStatus.PROPOSED,
    baseDatasetId: "dataset-1",
    baseTimetableId: "timetable-1",
    requestedById: admin.id,
    originalText: null,
    disruption,
    proposedSchedule: schedule,
    appliedDataset: null,
    diff: [],
    movedCount: 0,
    timeChangedCount: 0,
    roomOnlyCount: 0,
    report: { hard_violation_count: 0 },
    conflicts: null,
    explanation: null,
    deptApprovedById: null,
    deptApprovedAt: null,
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
    resultDatasetId: null,
    resultTimetableId: null,
    createdAt: now,
    updatedAt: now,
    requestedBy: {
      id: admin.id,
      name: "Admin One",
      role: Role.ADMIN,
      department: null,
      facultyId: null,
    },
    baseDataset: {
      id: "dataset-1",
      datasetKey: "cit-demo",
      version: 1,
      data: dataset,
    },
    ...overrides,
  }) as NonNullable<Awaited<ReturnType<ChangesRepository["findById"]>>>;

type RepositoryPort = NonNullable<
  ConstructorParameters<typeof ChangesService>[0]
>;
type EnginePort = Pick<EngineClient, "repair" | "validateSchedule">;

const makeRepository = (
  overrides: Partial<Record<keyof RepositoryPort, unknown>> = {},
): RepositoryPort =>
  ({
    findActiveBase: vi.fn(async () => ({
      id: "dataset-1",
      datasetKey: "cit-demo",
      label: "CIT Demo",
      version: 1,
      data: dataset,
      summary: {},
    })),
    findPublishedTimetable: vi.fn(async () => ({
      id: "timetable-1",
      schedule,
    })),
    findById: vi.fn(async () => changeRecord()),
    list: vi.fn(async () => []),
    createQueued: vi.fn(async () => ({
      change: { id: "change-1" },
      jobId: "job-1",
    })),
    saveRepair: vi.fn(async () => "change-1"),
    approve: vi.fn(async () => ({
      id: "change-1",
      datasetId: "dataset-2",
      timetableId: "timetable-2",
    })),
    review: vi.fn(async () => ({
      id: "change-1",
      status: ChangeStatus.REJECTED,
      reviewNote: "Rejected",
    })),
    deptApprove: vi.fn(async () => ({
      id: "change-1",
      status: ChangeStatus.DEPT_APPROVED,
    })),
    withdraw: vi.fn(async () => ({
      id: "change-1",
      status: ChangeStatus.WITHDRAWN,
    })),
    ...overrides,
  }) as unknown as RepositoryPort;

const makeEngine = (overrides: Partial<EnginePort> = {}): EnginePort => ({
  repair: vi.fn(async () => ({
    status: "proposed" as const,
    schedule_after: schedule,
    diff: [],
    moved_count: 0,
    time_changed_count: 0,
    room_only_count: 0,
    report: { hard_violation_count: 0 },
  })),
  validateSchedule: vi.fn(async () => ({
    report: { hard_violation_count: 0 },
  })),
  ...overrides,
});

const makeJobs = (
  process: (jobId: string, handler: JobHandler) => Promise<void>,
) => ({
  process,
  resumeQueued: vi.fn(async () => undefined),
});

const job = {
  id: "job-1",
  kind: JobKind.REPAIR,
  state: JobState.QUEUED,
  progress: 0,
  message: null,
  params: {
    changeId: "change-1",
    datasetId: "dataset-1",
    timetableId: "timetable-1",
  },
  resultType: null,
  resultId: null,
  error: null,
  createdById: admin.id,
  startedAt: null,
  finishedAt: null,
  createdAt: now,
  createdBy: { role: Role.ADMIN },
} satisfies Prisma.JobGetPayload<{
  include: { createdBy: { select: { role: true } } };
}>;

describe("changes routes", () => {
  const service = {
    submitAdmin: vi.fn(async () => ({ jobId: "job-1", changeId: "change-1" })),
    submitFile: vi.fn(async () => ({ jobId: "job-2", changeId: "change-2" })),
    submitFacultyUnavailability: vi.fn(async () => ({
      jobId: "job-3",
      changeId: "change-3",
    })),
    submitRequest: vi.fn(async () => ({
      jobId: "job-4",
      changeId: "change-4",
    })),
    list: vi.fn(async () => []),
    getById: vi.fn(async () => changeRecord()),
    deptApprove: vi.fn(async () => ({
      id: "change-1",
      status: ChangeStatus.DEPT_APPROVED,
    })),
    approve: vi.fn(async () => ({
      id: "change-1",
      datasetId: "dataset-2",
      timetableId: "timetable-2",
    })),
    reject: vi.fn(async () => ({
      id: "change-1",
      status: ChangeStatus.REJECTED,
      reviewNote: "Rejected",
    })),
    withdraw: vi.fn(async () => ({
      id: "change-1",
      status: ChangeStatus.WITHDRAWN,
    })),
  } satisfies ChangesControllerService;

  it("accepts a disruption JSON file at the upload endpoint", async () => {
    const app = express();
    app.use(express.json());
    const authenticate: RequestHandler = (req, _res, next) => {
      req.user = admin;
      next();
    };
    app.use("/api/changes", createChangesRouter(service, authenticate));
    app.use(notFound);
    app.use(errorHandler);

    const response = await request(app)
      .post("/api/changes/upload")
      .attach("file", Buffer.from(JSON.stringify(disruption)), "change.json");

    expect(response.status).toBe(202);
    expect(response.body.data).toEqual({
      jobId: "job-2",
      changeId: "change-2",
    });
    expect(service.submitFile).toHaveBeenCalledWith(admin, disruption);
  });
});

describe("changes service", () => {
  it("validates official disruption shapes while retaining unknown fields", () => {
    const parsed = disruptionSchema.parse(disruption);
    expect(parsed).toMatchObject({
      extra_metadata: "preserved",
      changes: [{ keep_unknown_property: "preserved" }],
    });
  });

  it("applies supported disruptions deterministically without mutating the source", () => {
    const result = applyDisruption(dataset, disruption);
    expect(result.rooms).toEqual([
      {
        room_id: "R1",
        unavailable: [
          {
            days: ["MON"],
            reason: "Maintenance",
          },
        ],
      },
    ]);
    expect(dataset.rooms[0]).toEqual({ room_id: "R1" });
  });

  it("queues a proposal without applying it to live dataset or timetable", async () => {
    const process = vi.fn(async () => undefined);
    const repository = makeRepository();
    const service = new ChangesService(
      repository,
      makeEngine(),
      makeJobs(process),
    );

    await expect(service.submitAdmin(admin, disruption)).resolves.toEqual({
      jobId: "job-1",
      changeId: "change-1",
    });

    expect(repository.createQueued).toHaveBeenCalledWith(
      expect.objectContaining({ id: admin.id, role: Role.ADMIN }),
      expect.objectContaining({
        source: ChangeSource.ADMIN_FORM,
        requestedById: admin.id,
        baseDatasetId: "dataset-1",
        baseTimetableId: "timetable-1",
        disruption,
      }),
    );
    expect(repository.approve).not.toHaveBeenCalled();
  });

  it("uses the signed-in faculty id for unavailability rather than body input", async () => {
    const repository = makeRepository();
    const service = new ChangesService(
      repository,
      makeEngine(),
      makeJobs(async () => {}),
    );

    await service.submitFacultyUnavailability(faculty, {
      days: ["WED"],
      reason: "Appointment",
      faculty_id: "FORGED",
    });

    expect(repository.createQueued).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: ChangeSource.FACULTY_UNAVAILABILITY,
        disruption: {
          changes: [
            {
              type: "faculty_unavailable",
              faculty_id: "F1",
              days: ["WED"],
              reason: "Appointment",
            },
          ],
        },
      }),
    );
  });

  it("stores IMPOSSIBLE conflicts returned by the repair engine", async () => {
    let handler: JobHandler | undefined;
    const process = vi.fn(async (_id: string, jobHandler: JobHandler) => {
      handler = jobHandler;
    });
    const saveRepair = vi.fn(async () => "change-1");
    const repository = makeRepository({ saveRepair });
    const engine = makeEngine({
      repair: vi.fn(async () => ({
        status: "impossible" as const,
        conflicts: [{ rule: "room_busy" }],
        explanation: "No available room.",
      })),
    });
    const service = new ChangesService(repository, engine, makeJobs(process));
    await service.submitAdmin(admin, disruption);
    const outcome = await handler?.(job);
    await outcome?.persist({} as Prisma.TransactionClient, job);

    expect(engine.repair).toHaveBeenCalledWith(
      expect.objectContaining({ dataset_id: "cit-demo" }),
      schedule,
      disruption,
      60,
    );
    expect(saveRepair).toHaveBeenCalledWith(
      expect.anything(),
      "change-1",
      expect.objectContaining({
        status: "IMPOSSIBLE",
        conflicts: [{ rule: "room_busy" }],
        explanation: "No available room.",
      }),
      expect.anything(),
    );
  });

  it("fails closed when a proposed repair reports hard violations", async () => {
    let handler: JobHandler | undefined;
    const process = vi.fn(async (_id: string, jobHandler: JobHandler) => {
      handler = jobHandler;
    });
    const repository = makeRepository();
    const service = new ChangesService(
      repository,
      makeEngine({
        repair: vi.fn(async () => ({
          status: "proposed" as const,
          schedule_after: schedule,
          diff: [],
          moved_count: 0,
          time_changed_count: 0,
          room_only_count: 0,
          report: { hard_violation_count: 1 },
        })),
      }),
      makeJobs(process),
    );
    await service.submitAdmin(admin, disruption);

    await expect(handler?.(job)).rejects.toMatchObject({
      code: "SCHEDULE_RULE_VIOLATION",
    });
    expect(repository.saveRepair).not.toHaveBeenCalled();
  });

  it("revalidates and atomically delegates applying an approved proposal", async () => {
    const appliedDataset = { ...dataset, rooms: [] };
    const change = changeRecord({
      source: ChangeSource.ADMIN_FILE,
      appliedDataset,
    });
    const repository = makeRepository({
      findById: vi.fn(async () => change),
      approve: vi.fn(async () => ({
        id: "change-1",
        datasetId: "dataset-2",
        timetableId: "timetable-2",
      })),
    });
    const engine = makeEngine();
    const service = new ChangesService(
      repository,
      engine,
      makeJobs(async () => {}),
    );

    await expect(service.approve("change-1", admin)).resolves.toEqual({
      id: "change-1",
      datasetId: "dataset-2",
      timetableId: "timetable-2",
    });

    expect(engine.validateSchedule).toHaveBeenCalledWith(
      appliedDataset,
      schedule,
    );
    expect(repository.approve).toHaveBeenCalledWith(
      "change-1",
      expect.objectContaining({ id: admin.id }),
      appliedDataset,
      schedule,
      { hard_violation_count: 0 },
    );
  });

  it("rejects without validating or applying a proposal", async () => {
    const repository = makeRepository();
    const engine = makeEngine();
    const service = new ChangesService(
      repository,
      engine,
      makeJobs(async () => {}),
    );

    await service.reject("change-1", admin, "Rejected");

    expect(repository.review).toHaveBeenCalledWith(
      "change-1",
      expect.objectContaining({ id: admin.id }),
      ChangeStatus.REJECTED,
      "Rejected",
    );
    expect(engine.validateSchedule).not.toHaveBeenCalled();
    expect(repository.approve).not.toHaveBeenCalled();
  });

  it("rejects approval when the base timetable is stale", async () => {
    const repository = makeRepository({
      findPublishedTimetable: vi.fn(async () => ({
        id: "new-timetable",
        schedule,
      })),
    });
    const engine = makeEngine();
    const service = new ChangesService(
      repository,
      engine,
      makeJobs(async () => {}),
    );

    await expect(service.approve("change-1", admin)).rejects.toMatchObject({
      code: "STALE_STATE",
    });
    expect(engine.validateSchedule).not.toHaveBeenCalled();
    expect(repository.approve).not.toHaveBeenCalled();
  });

  it("blocks self-approval for faculty-originated proposals", async () => {
    const change = changeRecord({
      source: ChangeSource.FACULTY_ASSISTANT,
      requestedById: admin.id,
    });
    const repository = makeRepository({
      findById: vi.fn(async () => change),
    });
    const service = new ChangesService(
      repository,
      makeEngine(),
      makeJobs(async () => {}),
    );

    await expect(service.approve("change-1", admin)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(repository.approve).not.toHaveBeenCalled();
  });

  it("limits faculty session requests to their own sessions", async () => {
    const service = new ChangesService(
      makeRepository(),
      makeEngine(),
      makeJobs(async () => {}),
    );
    await expect(
      service.submitRequest(
        { ...faculty, facultyId: "F-other" },
        {
          sessionId: "S1",
          requestedChange: "move",
          details: {},
        },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lists non-admin proposals only for their own requester id", async () => {
    const list = vi.fn(async () => [changeRecord()]);
    const repository = makeRepository({ list });
    const service = new ChangesService(
      repository,
      makeEngine(),
      makeJobs(async () => {}),
    );

    await service.list(faculty, { status: [ChangeStatus.PROPOSED] });

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ id: faculty.id, role: Role.FACULTY }),
      [ChangeStatus.PROPOSED],
    );
  });
});

describe("change repository approval transaction", () => {
  it("applies dataset, timetable, proposal state, and audits in one transaction", async () => {
    const tx = {
      changeProposal: {
        findUnique: vi.fn(async () => ({
          id: "change-1",
          status: ChangeStatus.PROPOSED,
          baseDatasetId: "dataset-1",
          baseTimetableId: "timetable-1",
          baseDataset: {
            id: "dataset-1",
            datasetKey: "cit-demo",
            label: "CIT Demo",
            version: 1,
          },
          baseTimetable: {
            id: "timetable-1",
            status: PublishStatus.PUBLISHED,
            schedule,
          },
          requestedBy: { id: admin.id, role: Role.ADMIN, department: null },
        })),
        update: vi.fn(async () => undefined),
      },
      dataset: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "dataset-1" })
          .mockResolvedValueOnce({ version: 1 }),
        create: vi.fn(async () => ({ id: "dataset-2" })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => undefined),
      },
      timetable: {
        findFirst: vi.fn(async () => ({ id: "timetable-1" })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        create: vi.fn(async () => ({ id: "timetable-2" })),
      },
      auditLog: { create: vi.fn(async () => undefined) },
    };
    const transaction = vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const repository = new ChangesRepository({
      $transaction: transaction,
    } as unknown as Prisma.TransactionClient as unknown as import("@prisma/client").PrismaClient);

    await repository.approve(
      "change-1",
      { id: admin.id, role: Role.ADMIN, department: null },
      dataset,
      schedule,
      { hard_violation_count: 0 },
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.dataset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "CHANGE_APPLIED",
          parentId: "dataset-1",
          isActive: false,
        }),
      }),
    );
    expect(tx.dataset.updateMany).toHaveBeenCalled();
    expect(tx.timetable.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "timetable-1", status: PublishStatus.PUBLISHED },
      }),
    );
    expect(tx.timetable.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PublishStatus.PUBLISHED,
          datasetId: "dataset-2",
          parentId: "timetable-1",
        }),
      }),
    );
    expect(tx.changeProposal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ChangeStatus.APPROVED,
          resultDatasetId: "dataset-2",
          resultTimetableId: "timetable-2",
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
  });
});
