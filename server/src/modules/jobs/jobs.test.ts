import express, { type RequestHandler } from "express";
import request from "supertest";
import { Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import errorHandler from "../../middlewares/error-handler.js";
import notFound from "../../middlewares/not-found.js";
import { UnauthorizedError } from "../../utils/api-error.js";
import type { RequestUser } from "../../types/express.js";
import { JobsService } from "./jobs.service.js";
import type { JobsRepository } from "./jobs.repository.js";
import { createJobsRouter } from "./jobs.routes.js";

type JobRecord = NonNullable<Awaited<ReturnType<JobsRepository["findById"]>>>;

const job: JobRecord = {
  id: "job-1",
  kind: "GENERATE_TIMETABLE",
  state: "SUCCEEDED",
  progress: 100,
  message: null,
  params: { datasetId: "dataset-1" },
  resultType: "Timetable",
  resultId: "timetable-1",
  error: null,
  createdById: "admin-1",
  startedAt: new Date("2026-10-31T10:00:00.000Z"),
  finishedAt: new Date("2026-10-31T10:01:00.000Z"),
  createdAt: new Date("2026-10-31T09:59:00.000Z"),
};

const makeRepository = (): Pick<JobsRepository, "list" | "findById"> => ({
  list: vi.fn(async (page, limit) => ({
    items: [job],
    total: 1,
    page,
    limit,
  })),
  findById: vi.fn(async (id) => (id === job.id ? job : null)),
});

const makeApp = (service: JobsService, actor: RequestUser): express.Express => {
  const app = express();
  const authenticate: RequestHandler = (req, _res, next) => {
    if (!actor) {
      next(new UnauthorizedError("Authentication is required."));
      return;
    }
    req.user = actor;
    next();
  };
  app.use("/api/jobs", createJobsRouter(service, authenticate));
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

describe("job routes", () => {
  it("lists jobs with pagination for admins", async () => {
    const repository = makeRepository();
    const service = new JobsService(repository);
    const actor: RequestUser = {
      id: "admin-1",
      role: Role.ADMIN,
      department: null,
      facultyId: null,
      clubName: null,
    };

    const response = await request(makeApp(service, actor)).get(
      "/api/jobs?page=2&limit=5",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      items: [{ id: "job-1", resultId: "timetable-1" }],
      total: 1,
      page: 2,
      limit: 5,
    });
    expect(repository.list).toHaveBeenCalledWith(2, 5);
  });

  it("does not allow non-admin users to list jobs", async () => {
    const repository = makeRepository();
    const service = new JobsService(repository);
    const actor: RequestUser = {
      id: "faculty-1",
      role: Role.FACULTY,
      department: null,
      facultyId: "F1",
      clubName: null,
    };

    const response = await request(makeApp(service, actor)).get("/api/jobs");

    expect(response.status).toBe(403);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("allows a job creator to view its status", async () => {
    const repository = makeRepository();
    const service = new JobsService(repository);
    const actor: RequestUser = {
      id: "admin-1",
      role: Role.FACULTY,
      department: null,
      facultyId: "F1",
      clubName: null,
    };

    const response = await request(makeApp(service, actor)).get(
      "/api/jobs/job-1",
    );

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe("job-1");
  });

  it("hides another creator's job", async () => {
    const repository = makeRepository();
    const service = new JobsService(repository);
    const actor: RequestUser = {
      id: "faculty-1",
      role: Role.FACULTY,
      department: null,
      facultyId: "F1",
      clubName: null,
    };

    const response = await request(makeApp(service, actor)).get(
      "/api/jobs/job-1",
    );

    expect(response.status).toBe(404);
  });
});
