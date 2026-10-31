import express, { type RequestHandler } from "express";
import request from "supertest";
import {
  ApprovalState,
  BookingCategory,
  DecisionStatus,
  JobKind,
  JobState,
  RequestStatus,
  Role,
  type Prisma,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { RequestUser } from "../../types/express.js";
import { JobService, type JobHandler } from "../../jobs/job.service.js";
import type { EngineClient } from "../../lib/engine/index.js";
import errorHandler from "../../middlewares/error-handler.js";
import notFound from "../../middlewares/not-found.js";
import { ForbiddenError, UnauthorizedError } from "../../utils/api-error.js";
import { BookingsRepository } from "./bookings.repository.js";
import { createBookingsRouter } from "./bookings.routes.js";
import { BookingsService } from "./bookings.service.js";
import type { BookingBody } from "./bookings.schema.js";
import type { BookingsControllerService } from "./bookings.controller.js";

const now = new Date("2026-10-31T12:00:00.000Z");
const dataset = {
  dataset_id: "cit-test",
  role_category_cap: {
    ADMIN: "INSTITUTE_EVENT",
    COORDINATOR: "DEPARTMENT_EVENT",
    FACULTY: "DEPARTMENT_EVENT",
    CLUB: "CLUB_EVENT",
  },
  priority_order: [
    "INSTITUTE_EVENT",
    "GUEST_LECTURE",
    "DEPARTMENT_EVENT",
    "CLUB_EVENT",
  ],
  groups: [{ group_id: "G1", department: "CSE" }],
  rooms: [
    { room_id: "R1", department: "CSE", room_type: "LAB" },
    { room_id: "R2", department: "ECE", room_type: "CLASSROOM" },
  ],
};
const activeDataset = { id: "dataset-1", data: dataset };
const timetable = { id: "timetable-1", schedule: { sessions: [] } };

const body: BookingBody = {
  title: "Robotics workshop",
  attendance: 30,
  durationPeriods: 2,
  windows: [{ day: "MON", from_period: 1, to_period: 4 }],
  roomTypes: ["LAB"],
  needs: ["projector"],
  requestedRoom: "R1",
  mandatoryForGroups: ["G1"],
  requestedCategory: BookingCategory.INSTITUTE_EVENT,
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

type RepositoryPort = NonNullable<
  ConstructorParameters<typeof BookingsService>[0]
>;
type EnginePort = Pick<
  EngineClient,
  "checkBookingDraft" | "decideBookings" | "validate"
>;

const makeEngine = (overrides: Partial<EnginePort> = {}): EnginePort => ({
  checkBookingDraft: vi.fn(async () => ({ ok: true, issues: [] })),
  decideBookings: vi.fn(async () => ({
    decisions: [],
    session_overrides: [],
    report: { hard_violation_count: 0 },
  })),
  validate: vi.fn(async () => ({ report: { hard_violation_count: 0 } })),
  ...overrides,
});

const makeRepository = (
  overrides: Partial<Record<keyof RepositoryPort, unknown>> = {},
): RepositoryPort =>
  ({
  findActiveDataset: vi.fn(async () => activeDataset),
  findDatasetById: vi.fn(async () => activeDataset),
  findRequester: vi.fn(async () => ({
    id: "faculty-1",
    name: "Faculty One",
    clubName: null,
    role: Role.FACULTY,
  })),
  findPriorityOrder: vi.fn(async () => ({ value: dataset.priority_order })),
  findPublishedTimetable: vi.fn(async () => timetable),
  findPublishedTimetableById: vi.fn(async () => timetable),
  listCandidates: vi.fn(async () => []),
  findAllForDataset: vi.fn(async () => []),
  findOverridesForValidation: vi.fn(async () => []),
  findCurrentDecisions: vi.fn(async () => []),
  findById: vi.fn(async () => null),
  findBySeries: vi.fn(async () => []),
  createRequest: vi.fn(async () => {
    throw new Error("createRequest fixture was not configured");
  }),
  updateRequest: vi.fn(async () => {
    throw new Error("updateRequest fixture was not configured");
  }),
  cancelRequest: vi.fn(async () => {
    throw new Error("cancelRequest fixture was not configured");
  }),
  enqueueDecision: vi.fn(async () => ({
    id: "job-1",
    kind: JobKind.DECIDE_BOOKINGS,
    state: JobState.QUEUED,
    progress: 0,
    message: null,
    params: null,
    resultType: null,
    resultId: null,
    error: null,
    createdById: "admin-1",
    startedAt: null,
    finishedAt: null,
    createdAt: now,
  })),
  persistEngineDecisions: vi.fn(async () => []),
  addManualDecision: vi.fn(async () => {
    throw new Error("addManualDecision fixture was not configured");
  }),
  findDecision: vi.fn(async () => null),
  createOverrideDecision: vi.fn(async () => {
    throw new Error("createOverrideDecision fixture was not configured");
  }),
  approveDecision: vi.fn(async () => ({ id: "decision-1" })),
  rejectDecision: vi.fn(async () => ({ id: "decision-1" })),
  auditDepartmentApproval: vi.fn(async () => ({
    id: "decision-1",
    approvalState: ApprovalState.PENDING_ADMIN,
  })),
  ...overrides,
  }) as unknown as RepositoryPort;

const makeJobs = (
  process: JobService["process"] = async () => undefined,
): Pick<JobService, "process" | "resumeQueued"> => ({
  process,
  resumeQueued: vi.fn(async () => undefined),
});

const requestRow = {
  id: "request-1",
  datasetId: "dataset-1",
  externalId: "BR-01",
  requesterId: "faculty-1",
  requesterName: "Faculty One",
  requesterRole: Role.FACULTY,
  requestedCategory: BookingCategory.INSTITUTE_EVENT,
  effectiveCategory: BookingCategory.DEPARTMENT_EVENT,
  title: "Robotics workshop",
  attendance: 30,
  durationPeriods: 2,
  windows: [{ day: "MON", from_period: 1, to_period: 4 }],
  roomTypes: ["LAB"],
  needs: ["projector"],
  requestedRoom: "R1",
  mandatoryForGroups: ["G1"],
  seriesId: null,
  rawText: null,
  llmDraft: null,
  submittedAt: now,
  status: RequestStatus.SUBMITTED,
  cancelledAt: null,
  cancelNote: null,
  createdAt: now,
} satisfies Awaited<
  ReturnType<BookingsRepository["findAllForDataset"]>
>[number];
const requestDetail = {
  ...requestRow,
  requester: { department: "CSE" },
  decisions: [],
} satisfies NonNullable<Awaited<ReturnType<BookingsRepository["findById"]>>>;
const requestListRow = {
  ...requestRow,
  requester: { department: "ECE" },
  decisions: [],
} satisfies Awaited<
  ReturnType<BookingsRepository["listCandidates"]>
>[number];

let actor: RequestUser | undefined;

const authentication: RequestHandler = (req, _res, next) => {
  if (!actor) {
    next(new UnauthorizedError("Authentication is required."));
    return;
  }
  req.user = actor;
  next();
};

const routeService = {
  create: vi.fn(async () => ({ id: "request-1" })),
  checkDraft: vi.fn(async () => ({ ok: true, issues: [] })),
  list: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
  getSeries: vi.fn(async () => []),
  getById: vi.fn(async () => ({ id: "request-1" })),
  update: vi.fn(async () => ({ id: "request-1" })),
  cancel: vi.fn(async () => ({ id: "request-1" })),
  queueDecisions: vi.fn(async () => ({ jobId: "job-1" })),
  override: vi.fn(async () => ({ id: "decision-1" })),
  approveDecision: vi.fn(async () => ({ id: "decision-1" })),
  rejectDecision: vi.fn(async () => ({ id: "decision-1" })),
  deptApprove: vi.fn(async () => ({ id: "decision-1" })),
  manual: vi.fn(async () => ({ id: "request-1" })),
};

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/bookings",
    createBookingsRouter(
      routeService as unknown as BookingsControllerService,
      authentication,
    ),
  );
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

describe("booking routes", () => {
  it("creates a booking for an authenticated requester", async () => {
    actor = faculty;
    const response = await request(makeApp()).post("/api/bookings").send(body);

    expect(response.status).toBe(201);
    expect(routeService.create).toHaveBeenCalledWith(faculty, body);
  });

  it("requires authentication and validates request bodies", async () => {
    actor = undefined;
    const unauthenticated = await request(makeApp())
      .post("/api/bookings")
      .send(body);
    actor = faculty;
    const invalid = await request(makeApp())
      .post("/api/bookings")
      .send({ ...body, requesterId: "spoofed" });

    expect(unauthenticated.status).toBe(401);
    expect(invalid.status).toBe(422);
  });

  it("queues Admin booking decisions and rejects other roles", async () => {
    actor = admin;
    const queued = await request(makeApp()).post("/api/bookings/decide");
    actor = faculty;
    const forbidden = await request(makeApp()).post("/api/bookings/decide");

    expect(queued.status).toBe(202);
    expect(queued.body.data).toEqual({ jobId: "job-1" });
    expect(forbidden.status).toBe(403);
  });

  it("allows coordinators to use the department approval endpoint only", async () => {
    actor = { ...faculty, role: Role.COORDINATOR };
    const response = await request(makeApp()).post(
      "/api/bookings/decisions/decision-1/dept-approve",
    );

    expect(response.status).toBe(200);
    expect(routeService.deptApprove).toHaveBeenCalledWith("decision-1", actor);
  });
});

describe("booking business rules", () => {
  it("caps a requested category using the role cap and priority order", async () => {
    const createRequest = vi.fn(async () => requestRow);
    const repository = makeRepository({ createRequest });
    const service = new BookingsService(
      repository,
      {} as Pick<
        EngineClient,
        "checkBookingDraft" | "decideBookings" | "validate"
      >,
    );

    await service.create(faculty, body);

    expect(createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedCategory: BookingCategory.INSTITUTE_EVENT,
        effectiveCategory: BookingCategory.DEPARTMENT_EVENT,
        requesterId: faculty.id,
        requesterName: "Faculty One",
        requesterRole: Role.FACULTY,
      }),
      expect.objectContaining({ id: faculty.id }),
    );
  });

  it("scopes coordinator lists by department users, rooms, and groups", async () => {
    const otherRequest = {
      ...requestListRow,
      id: "request-outside",
      requestedRoom: "R2",
      mandatoryForGroups: [],
    } satisfies Awaited<
      ReturnType<BookingsRepository["listCandidates"]>
    >[number];
    const repository = makeRepository({
      listCandidates: vi.fn(async () => [requestListRow, otherRequest]),
    });
    const service = new BookingsService(repository, makeEngine());

    const result = await service.list(
      { ...faculty, role: Role.COORDINATOR },
      { page: 1, limit: 20 },
    );

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe("request-1");
    expect(result.items[0]?.currentDecision).toBeNull();
  });

  it("cancels the request and delegates current-decision invalidation", async () => {
    const cancelRequest = vi.fn(async () => ({
      ...requestRow,
      status: RequestStatus.CANCELLED,
    }));
    const repository = makeRepository({
      findById: vi.fn(async () => requestDetail),
      cancelRequest,
    });
    const service = new BookingsService(repository, makeEngine());

    await service.cancel("request-1", faculty, "No longer needed");

    expect(cancelRequest).toHaveBeenCalledWith(
      "request-1",
      expect.objectContaining({ id: faculty.id }),
      "No longer needed",
    );
  });

  it("fails closed when the booking engine reports hard violations", async () => {
    let capturedHandler: JobHandler | undefined;
    const process = vi.fn(async (_jobId: string, handler: JobHandler) => {
      capturedHandler = handler;
    });
    const repository = makeRepository({
      enqueueDecision: vi.fn(async () => ({
        id: "job-1",
        kind: JobKind.DECIDE_BOOKINGS,
        state: JobState.QUEUED,
        progress: 0,
        message: null,
        params: {
          datasetId: "dataset-1",
          timetableId: "timetable-1",
          requestId: null,
        },
        resultType: null,
        resultId: null,
        error: null,
        createdById: admin.id,
        createdBy: { role: Role.ADMIN },
        startedAt: null,
        finishedAt: null,
        createdAt: now,
      })),
    });
    const decideBookings = vi.fn(async () => ({
      decisions: [],
      session_overrides: [],
      report: { hard_violation_count: 1, violations: ["collision"] },
    }));
    const engine = makeEngine({ decideBookings });
    const service = new BookingsService(repository, engine, makeJobs(process));

    await service.queueDecisions(admin);
    await expect(
      capturedHandler?.({
        id: "job-1",
        kind: JobKind.DECIDE_BOOKINGS,
        state: JobState.QUEUED,
        progress: 0,
        message: null,
        params: {
          datasetId: "dataset-1",
          timetableId: "timetable-1",
          requestId: null,
        },
        resultType: null,
        resultId: null,
        error: null,
        createdById: admin.id,
        createdBy: { role: Role.ADMIN },
        startedAt: null,
        finishedAt: null,
        createdAt: now,
      } as Prisma.JobGetPayload<{
        include: { createdBy: { select: { role: true } } };
      }>),
    ).rejects.toMatchObject({ code: "SCHEDULE_RULE_VIOLATION" });
    expect(repository.persistEngineDecisions).not.toHaveBeenCalled();
  });

  it("preserves session overrides for the PENDING_ADMIN decision path", async () => {
    let capturedHandler: JobHandler | undefined;
    const process = vi.fn(async (_jobId: string, handler: JobHandler) => {
      capturedHandler = handler;
    });
    const persistEngineDecisions = vi.fn(async () => ["request-1"]);
    const repository = makeRepository({
      findAllForDataset: vi.fn(async () => [requestRow]),
      persistEngineDecisions,
      enqueueDecision: vi.fn(async () => ({
        id: "job-1",
        kind: JobKind.DECIDE_BOOKINGS,
        state: JobState.QUEUED,
        progress: 0,
        message: null,
        params: {
          datasetId: "dataset-1",
          timetableId: "timetable-1",
          requestId: null,
        },
        resultType: null,
        resultId: null,
        error: null,
        createdById: admin.id,
        startedAt: null,
        finishedAt: null,
        createdAt: now,
      })),
    });
    const engine = makeEngine({
      decideBookings: vi.fn(async () => ({
        decisions: [
          {
            request_id: "request-1",
            status: "APPROVED",
            day: "MON",
            start_period: 1,
            end_period: 2,
            room_id: "R1",
            reason: "",
          },
        ],
        session_overrides: [
          {
            request_id: "request-1",
            session_id: "S1",
            from_day: "MON",
            from_start: 1,
            from_room: "R1",
            to_day: "MON",
            to_start: 3,
            to_room: "R2",
          },
        ],
        report: { hard_violation_count: 0 },
      })),
    });
    const service = new BookingsService(repository, engine, makeJobs(process));
    const job = {
      id: "job-1",
      kind: JobKind.DECIDE_BOOKINGS,
      state: JobState.QUEUED,
      progress: 0,
      message: null,
      params: {
        datasetId: "dataset-1",
        timetableId: "timetable-1",
        requestId: null,
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

    await service.queueDecisions(admin);
    const outcome = await capturedHandler?.(job);
    expect(outcome).toBeDefined();
    await outcome?.persist({} as Prisma.TransactionClient, job);

    expect(persistEngineDecisions).toHaveBeenCalledWith(
      expect.anything(),
      "dataset-1",
      "timetable-1",
      [
        expect.objectContaining({
          request_id: "request-1",
          status: DecisionStatus.APPROVED,
          session_overrides: [expect.objectContaining({ session_id: "S1" })],
        }),
      ],
      { id: admin.id, role: Role.ADMIN },
    );
  });

  it("blocks self-approval with SELF_APPROVAL_NOT_ALLOWED", async () => {
    const repository = makeRepository({
      findActiveDataset: vi.fn(async () => activeDataset),
      findPublishedTimetable: vi.fn(async () => timetable),
      findDecision: vi.fn(async () => ({
        id: "decision-1",
        requestId: "request-1",
        timetableId: "timetable-1",
        status: DecisionStatus.APPROVED,
        day: "MON",
        startPeriod: 1,
        endPeriod: 2,
        roomId: "R1",
        reason: "",
        source: "RULE_ENGINE",
        decidedById: null,
        approvalState: ApprovalState.PENDING_ADMIN,
        approvedById: null,
        approvedAt: null,
        isCurrent: true,
        createdAt: now,
        request: {
          id: "request-1",
          datasetId: "dataset-1",
          requesterId: admin.id,
          requestedRoom: "R1",
          mandatoryForGroups: ["G1"],
          roomTypes: ["LAB"],
          needs: [],
          status: RequestStatus.SUBMITTED,
          requester: { department: null },
          decisions: [],
        },
        overrides: [],
      })),
    });
    const service = new BookingsService(repository, makeEngine());

    await expect(
      service.approveDecision("decision-1", admin),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "SELF_APPROVAL_NOT_ALLOWED",
    });
    expect(repository.approveDecision).not.toHaveBeenCalled();
  });

  it("requires a published timetable for draft checks", async () => {
    const repository = makeRepository({
      findPublishedTimetable: vi.fn(async () => null),
    });
    const service = new BookingsService(repository, makeEngine());

    await expect(service.checkDraft(faculty, body)).rejects.toMatchObject({
      code: "NO_PUBLISHED_TIMETABLE",
    });
  });
});
