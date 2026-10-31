import express, { type RequestHandler } from "express";
import request from "supertest";
import { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";
import errorHandler from "../../middlewares/error-handler.js";
import notFound from "../../middlewares/not-found.js";
import { UnauthorizedError } from "../../utils/api-error.js";
import { createSystemRouter } from "./system.routes.js";

const activeUser = {
  id: "user-1",
  role: Role.FACULTY,
  department: "CSE",
  facultyId: "F07",
  clubName: null,
};

const makeApp = (authenticate?: RequestHandler): express.Express => {
  const app = express();
  app.use("/api", createSystemRouter(undefined, authenticate));
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

describe("Phase 0 system endpoints", () => {
  it("serves health publicly", async () => {
    const response = await request(makeApp()).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      statusCode: 200,
      success: true,
      data: { status: "ok" },
    });
  });

  it("requires authentication for the current-user endpoint", async () => {
    const authenticate: RequestHandler = (_req, _res, next) => {
      next(new UnauthorizedError("Authentication is required."));
    };

    const response = await request(makeApp(authenticate)).get("/api/me");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });

  it("returns the authenticated database user profile", async () => {
    const authenticate: RequestHandler = (req, _res, next) => {
      req.user = activeUser;
      next();
    };

    const response = await request(makeApp(authenticate)).get("/api/me");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(activeUser);
  });
});
