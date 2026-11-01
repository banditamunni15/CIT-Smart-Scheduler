import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import errorHandler from "../../middlewares/error-handler.js";
import { UnauthorizedError } from "../../utils/api-error.js";
import type { RequestUser } from "../../types/express.js";
import { createAssistantRouter } from "./assistant.routes.js";
import { AssistantService } from "./assistant.service.js";

const user: RequestUser = {
  id: "user-1",
  role: "FACULTY",
  department: "CSE",
  facultyId: "faculty-1",
  clubName: null,
};

const authenticated: RequestHandler = (req, _res, next) => {
  req.user = user;
  next();
};

const makeApp = (service: Parameters<typeof createAssistantRouter>[0]) => {
  const app = express();
  app.use(express.json());
  app.use("/api/assistant", createAssistantRouter(service, authenticated));
  app.use(errorHandler);
  return app;
};

describe("assistant chat", () => {
  it("uses database context and returns the model response", async () => {
    const dataSource = {
      getContext: vi.fn(async () => ({
        generatedAt: "2026-11-01T00:00:00.000Z",
        userRole: "FACULTY",
        activeDataset: null,
        datasetReference: null,
        publishedTimetable: {
          id: "tt-1",
          label: null,
          publishedAt: null,
          sessions: [{ session_id: "S1", day: "MON", start_period: 2 }],
        },
        publishedExams: null,
        myBookings: [],
        myChangeRequests: [],
        myRecentJobs: [],
      })),
    };
    const respond = vi.fn(
      async (_instructions: string, _input: string) =>
        "Your class is on Monday, period 2.",
    );
    const service = new AssistantService(dataSource, () => ({ respond }));

    const result = await service.chat(user, [
      { role: "user", content: "When is my class?" },
    ]);

    expect(result.reply).toContain("Monday");
    expect(dataSource.getContext).toHaveBeenCalledWith(user, [
      { role: "user", content: "When is my class?" },
    ]);
    expect(respond).toHaveBeenCalledOnce();
    expect(respond.mock.calls[0]?.[1]).toContain('"session_id":"S1"');
  });

  it("requires authentication", async () => {
    const service = {
      chat: vi.fn(async () => ({ reply: "unused" })),
    };
    const unauthenticated: RequestHandler = (_req, _res, next) => {
      next(new UnauthorizedError("Authentication is required."));
    };
    const app = express();
    app.use(express.json());
    app.use("/api/assistant", createAssistantRouter(service, unauthenticated));
    app.use(errorHandler);

    const response = await request(app)
      .post("/api/assistant/chat")
      .send({ messages: [{ role: "user", content: "Hello" }] });

    expect(response.status).toBe(401);
    expect(service.chat).not.toHaveBeenCalled();
  });

  it("rejects malformed or oversized conversation history", async () => {
    const service = {
      chat: vi.fn(async () => ({ reply: "unused" })),
    };

    const response = await request(makeApp(service))
      .post("/api/assistant/chat")
      .send({
        messages: [{ role: "assistant", content: "Not a user question." }],
      });

    expect(response.status).toBe(422);
    expect(service.chat).not.toHaveBeenCalled();
  });
});
