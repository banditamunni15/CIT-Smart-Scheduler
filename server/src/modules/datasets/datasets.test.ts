import express, { type RequestHandler } from "express";
import request from "supertest";
import { Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import errorHandler from "../../middlewares/error-handler.js";
import notFound from "../../middlewares/not-found.js";
import { UnauthorizedError } from "../../utils/api-error.js";
import type { RequestUser } from "../../types/express.js";
import { createDatasetsRouter } from "./datasets.routes.js";
import { DatasetsService } from "./datasets.service.js";
import type { DatasetsRepository } from "./datasets.repository.js";
import type { EngineClient } from "../../lib/engine/index.js";

const admin = {
  id: "admin-1",
  role: Role.ADMIN,
  department: null,
  facultyId: null,
  clubName: null,
};

const activeSummary = {
  id: "dataset-1",
  datasetKey: "cit-demo",
  label: "CIT demo",
  version: 1,
  source: "UPLOAD" as const,
  summary: { counts: { groups: 2 }, warnings: [] },
  createdAt: new Date("2026-10-31T00:00:00.000Z"),
};

const validDataset = {
  dataset_id: "cit-upload",
  calendar: { days: ["MON"], lunch: { after_period: 4 }, lab_start_periods: [1] },
  rooms: [{ id: "R1" }], room_unavailability: [], faculty: [{ id: "F1" }],
  student_groups: [{ id: "G1" }, { id: "G2" }], courses: [{ id: "C1" }],
  sessions: [{ id: "S1" }], booking_requests: [], cancellations: [], exams: [],
  priority_order: ["institute_event", "guest_lecture", "department_event", "club_event"],
  role_category_cap: { admin: "institute_event", faculty: "guest_lecture", department_coordinator: "department_event", club: "club_event" },
};

type TestDatasetsService = Pick<
  DatasetsService,
  "list" | "getActiveSummary" | "upload" | "activate" | "resetDemo"
>;

const makeService = (): TestDatasetsService => ({
  list: vi.fn(async ({ page, limit }) => ({
    items: [],
    total: 0,
    page,
    limit,
  })),
  getActiveSummary: vi.fn(async () => activeSummary),
  upload: vi.fn(async () => ({ ...activeSummary, isActive: false })),
  activate: vi.fn(async () => ({ ...activeSummary, isActive: true })),
  resetDemo: vi.fn(async () => ({
    dataset: {
      id: activeSummary.id,
      datasetKey: activeSummary.datasetKey,
      version: 1,
    },
    archivedTimetables: 2,
    archivedExamSchedules: 1,
    clearedJobs: 3,
  })),
});

const makeApp = (
  service: TestDatasetsService,
  actor: RequestUser | null = admin,
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
  app.use("/api", createDatasetsRouter(service, authenticate));
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

describe("dataset routes", () => {
  it("lists datasets with pagination for admins", async () => {
    const service = makeService();
    const response = await request(makeApp(service)).get(
      "/api/datasets?page=2&limit=5",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      items: [],
      total: 0,
      page: 2,
      limit: 5,
    });
    expect(service.list).toHaveBeenCalledWith({ page: 2, limit: 5 });
  });

  it("rejects non-admin users from dataset management routes", async () => {
    const service = makeService();
    const response = await request(
      makeApp(service, { ...admin, role: Role.FACULTY }),
    ).get("/api/datasets");

    expect(response.status).toBe(403);
    expect(service.list).not.toHaveBeenCalled();
  });

  it("returns only the active dataset summary publicly", async () => {
    const service = makeService();
    const response = await request(makeApp(service, null)).get(
      "/api/datasets/active",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: "dataset-1",
      summary: { counts: { groups: 2 } },
    });
    expect(response.body.data.data).toBeUndefined();
  });

  it("validates the upload body before calling the service", async () => {
    const service = makeService();
    const response = await request(makeApp(service))
      .post("/api/datasets/upload")
      .send({ label: "Missing ID", data: { rooms: [] } });

    expect(response.status).toBe(422);
    expect(service.upload).not.toHaveBeenCalled();
  });

  it("uploads a dataset as an admin", async () => {
    const service = makeService();
    const response = await request(makeApp(service))
      .post("/api/datasets/upload")
      .send({
        label: "CIT demo",
        data: { dataset_id: "cit-demo", groups: [{ id: "G1" }] },
      });

    expect(response.status).toBe(201);
    expect(service.upload).toHaveBeenCalledWith(
      { id: "admin-1", role: Role.ADMIN },
      {
        label: "CIT demo",
        data: { dataset_id: "cit-demo", groups: [{ id: "G1" }] },
      },
    );
  });

  it("activates a dataset and supports admin demo reset", async () => {
    const service = makeService();
    const app = makeApp(service);

    const activation = await request(app).post(
      "/api/datasets/dataset-1/activate",
    );
    const reset = await request(app).post("/api/admin/reset-demo");

    expect(activation.status).toBe(200);
    expect(service.activate).toHaveBeenCalledWith("dataset-1", {
      id: "admin-1",
      role: Role.ADMIN,
    });
    expect(reset.status).toBe(200);
    expect(service.resetDemo).toHaveBeenCalledWith({
      id: "admin-1",
      role: Role.ADMIN,
    });
  });
});

describe("dataset upload validation", () => {
  it("saves a validated upload with a server-computed summary", async () => {
    const repository: Pick<
      DatasetsRepository,
      "list" | "findActiveSummary" | "upload" | "activate" | "resetDemo"
    > = {
      list: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
      findActiveSummary: vi.fn(async () => activeSummary),
      upload: vi.fn(async (_actor, input, summary) => ({
        ...activeSummary,
        label: input.label,
        datasetKey: String(input.data.dataset_id),
        summary,
        isActive: false,
      })),
      activate: vi.fn(async () => ({ ...activeSummary, isActive: true })),
      resetDemo: vi.fn(async () => ({
        dataset: {
          id: activeSummary.id,
          datasetKey: activeSummary.datasetKey,
          version: 1,
        },
        archivedTimetables: 0,
        archivedExamSchedules: 0,
        clearedJobs: 0,
      })),
    };
    const engine: Pick<EngineClient, "validate"> = {
      validate: vi.fn(async () => ({
        report: { hard_violation_count: 0 },
      })),
    };
    const service = new DatasetsService(repository, engine);

    await service.upload(
      { id: "admin-1", role: Role.ADMIN },
      {
        label: "CIT upload",
        data: validDataset,
      },
    );

    expect(repository.upload).toHaveBeenCalledWith(
      { id: "admin-1", role: Role.ADMIN },
      {
        label: "CIT upload",
        data: validDataset,
      },
      {
        counts: { rooms: 1, room_unavailability: 0, faculty: 1, student_groups: 2, courses: 1, sessions: 1, booking_requests: 0, cancellations: 0, exams: 0, priority_order: 4 },
        warnings: [],
      },
    );
  });

  it("rejects datasets that do not satisfy the engine dataset envelope", async () => {
    const repository: Pick<
      DatasetsRepository,
      "list" | "findActiveSummary" | "upload" | "activate" | "resetDemo"
    > = {
      list: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
      findActiveSummary: vi.fn(async () => activeSummary),
      upload: vi.fn(async () => { throw new Error("upload must not be called"); }),
      activate: vi.fn(async () => ({ ...activeSummary, isActive: true })),
      resetDemo: vi.fn(async () => ({ dataset: { id: activeSummary.id, datasetKey: activeSummary.datasetKey, version: 1 }, archivedTimetables: 0, archivedExamSchedules: 0, clearedJobs: 0 })),
    };
    const service = new DatasetsService(repository);
    await expect(service.upload(
      { id: "admin-1", role: Role.ADMIN },
      { label: "Invalid", data: { dataset_id: "invalid", rooms: [] } },
    )).rejects.toMatchObject({ code: "DATASET_INVALID" });
    expect(repository.upload).not.toHaveBeenCalled();
  });

});
