import express, { type RequestHandler } from "express";
import request from "supertest";
import { Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import errorHandler from "../../middlewares/error-handler.js";
import notFound from "../../middlewares/not-found.js";
import { UnauthorizedError } from "../../utils/api-error.js";
import type { RequestUser } from "../../types/express.js";
import { createSettingsRouter } from "./settings.routes.js";
import type { SettingsService } from "./settings.service.js";

const admin = {
  id: "admin-1",
  role: Role.ADMIN,
  department: null,
  facultyId: null,
  clubName: null,
};

type TestSettingsService = Pick<
  SettingsService,
  "getPriorityOrder" | "setPriorityOrder"
>;

const makeApp = (
  service: TestSettingsService,
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
  app.use("/api", createSettingsRouter(service, authenticate));
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

describe("priority-order routes", () => {
  it("returns the priority order publicly", async () => {
    const service: TestSettingsService = {
      getPriorityOrder: vi.fn(async () => ["FACULTY", "COURSE"]),
      setPriorityOrder: vi.fn(async () => []),
    };
    const response = await request(makeApp(service, null)).get(
      "/api/settings/priority-order",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(["FACULTY", "COURSE"]);
  });

  it("allows an admin to update the priority order", async () => {
    const service: TestSettingsService = {
      getPriorityOrder: vi.fn(async () => []),
      setPriorityOrder: vi.fn(async (order) => order),
    };
    const response = await request(makeApp(service))
      .put("/api/settings/priority-order")
      .send({ priority_order: ["FACULTY", "COURSE"] });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(["FACULTY", "COURSE"]);
    expect(service.setPriorityOrder).toHaveBeenCalledWith(
      ["FACULTY", "COURSE"],
      { id: "admin-1", role: Role.ADMIN },
    );
  });

  it("rejects invalid priority-order input", async () => {
    const service: TestSettingsService = {
      getPriorityOrder: vi.fn(async () => []),
      setPriorityOrder: vi.fn(async () => []),
    };
    const response = await request(makeApp(service))
      .put("/api/settings/priority-order")
      .send({ priority_order: ["FACULTY", "FACULTY"] });

    expect(response.status).toBe(422);
    expect(service.setPriorityOrder).not.toHaveBeenCalled();
  });

  it("does not allow a non-admin to update priorities", async () => {
    const service: TestSettingsService = {
      getPriorityOrder: vi.fn(async () => []),
      setPriorityOrder: vi.fn(async () => []),
    };
    const response = await request(
      makeApp(service, { ...admin, role: Role.FACULTY }),
    )
      .put("/api/settings/priority-order")
      .send({ priority_order: ["FACULTY"] });

    expect(response.status).toBe(403);
    expect(service.setPriorityOrder).not.toHaveBeenCalled();
  });
});
