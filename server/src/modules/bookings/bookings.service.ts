import {
  ApprovalState,
  BookingCategory,
  DecisionStatus,
  JobKind,
  Prisma,
  RequestStatus,
  Role,
  type Job,
} from "@prisma/client";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../utils/api-error.js";
import { createEngine, type EngineClient } from "../../lib/engine/index.js";
import { prisma } from "../../lib/prisma.js";
import {
  JobService,
  jobService,
  type JobHandler,
} from "../../jobs/job.service.js";
import type { RequestUser } from "../../types/express.js";
import {
  BookingsRepository,
  bookingsRepository,
  type BookingActor,
  type BookingInput,
} from "./bookings.repository.js";
import type {
  BookingBody,
  BookingDecisionBody,
  BookingListQuery,
  BookingManualBody,
  BookingPatchBody,
} from "./bookings.schema.js";

type JsonRecord = Prisma.JsonObject;
type BookingRecord = Awaited<ReturnType<BookingsRepository["findById"]>>;

const isRecord = (value: Prisma.JsonValue | undefined): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringAt = (
  value: Prisma.JsonValue | undefined,
  keys: string[],
): string | undefined => {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return undefined;
};

const toDatasetObject = (value: Prisma.JsonValue): Prisma.InputJsonObject => {
  if (!isRecord(value)) {
    throw new ValidationError(
      "The active dataset must be a JSON object.",
      "DATASET_INVALID",
    );
  }
  return value;
};

const toCategory = (value: unknown): BookingCategory | undefined =>
  Object.values(BookingCategory).find((category) => category === value);

const priorityOrderFor = (
  dataset: Prisma.JsonValue,
  setting: Prisma.JsonValue | undefined,
): BookingCategory[] => {
  const candidates = [
    ...(Array.isArray(setting) ? setting : []),
    ...(isRecord(dataset) && Array.isArray(dataset.priority_order)
      ? dataset.priority_order
      : []),
  ];
  const supplied = candidates
    .map(toCategory)
    .filter((category): category is BookingCategory => category !== undefined);
  const fallback = [
    BookingCategory.INSTITUTE_EVENT,
    BookingCategory.GUEST_LECTURE,
    BookingCategory.DEPARTMENT_EVENT,
    BookingCategory.CLUB_EVENT,
  ];
  return supplied.length === 4 && new Set(supplied).size === 4
    ? supplied
    : fallback;
};

const roleCategoryCap = (
  dataset: Prisma.JsonValue,
  role: Role,
): BookingCategory => {
  if (!isRecord(dataset) || !isRecord(dataset.role_category_cap)) {
    throw new ValidationError(
      "The dataset is missing role_category_cap.",
      "DATASET_INVALID",
    );
  }
  const cap = toCategory(dataset.role_category_cap[role]);
  if (!cap) {
    throw new ValidationError(
      `The dataset has no valid category cap for ${role}.`,
      "DATASET_INVALID",
    );
  }
  return cap;
};

const effectiveCategory = (
  requested: BookingCategory,
  cap: BookingCategory,
  priority: BookingCategory[],
): BookingCategory => {
  const requestedIndex = priority.indexOf(requested);
  const capIndex = priority.indexOf(cap);
  return requestedIndex >= capIndex ? requested : cap;
};

const inputFor = (
  actor: RequestUser,
  requesterName: string,
  datasetId: string,
  body: BookingBody,
  effective: BookingCategory,
): BookingInput => ({
  ...body,
  datasetId,
  requesterId: actor.id,
  requesterName,
  requesterRole: actor.role,
  requestedCategory: body.requestedCategory,
  effectiveCategory: effective,
  submittedAt: new Date(),
});

const groupAndRoomIdsForDepartment = (
  dataset: Prisma.JsonValue,
  department: string,
) => {
  if (!isRecord(dataset))
    return { groups: new Set<string>(), rooms: new Set<string>() };
  const findIds = (field: string, idKeys: string[]) => {
    const values = dataset[field];
    if (!Array.isArray(values)) return new Set<string>();
    return new Set(
      values.flatMap((item) => {
        if (!isRecord(item)) return [];
        const ownerDepartment =
          stringAt(item.department, ["id", "name"]) ??
          stringAt(item, ["department", "department_id", "departmentId"]);
        const id = stringAt(item, idKeys);
        return ownerDepartment === department && id ? [id] : [];
      }),
    );
  };
  return {
    groups: findIds("groups", ["group_id", "id"]),
    rooms: findIds("rooms", ["room_id", "id"]),
  };
};

const mapBookingFromList = (request: {
  id: string;
  externalId: string;
  requesterId: string | null;
  requesterName: string;
  requesterRole: Role;
  requestedCategory: BookingCategory;
  effectiveCategory: BookingCategory;
  title: string;
  attendance: number;
  durationPeriods: number;
  windows: Prisma.JsonValue;
  roomTypes: string[];
  needs: string[];
  requestedRoom: string | null;
  mandatoryForGroups: string[];
  seriesId: string | null;
  rawText: string | null;
  llmDraft: Prisma.JsonValue | null;
  submittedAt: Date;
  status: RequestStatus;
  cancelledAt: Date | null;
  cancelNote: string | null;
  createdAt: Date;
  decisions: Array<{
    day: string | null;
    roomId: string | null;
    status: DecisionStatus;
  }>;
}) => {
  const { decisions, ...booking } = request;
  return {
    ...booking,
    currentDecision: decisions[0] ?? null,
  };
};

export class BookingsService {
  private readonly decisionJob: JobHandler;

  constructor(
    private readonly repository: Pick<
      BookingsRepository,
      | "findActiveDataset"
      | "findDatasetById"
      | "findRequester"
      | "findPriorityOrder"
      | "findPublishedTimetable"
      | "findPublishedTimetableById"
      | "listCandidates"
      | "findAllForDataset"
      | "findById"
      | "findBySeries"
      | "findOverridesForValidation"
      | "findCurrentDecisions"
      | "createRequest"
      | "updateRequest"
      | "cancelRequest"
      | "enqueueDecision"
      | "persistEngineDecisions"
      | "addManualDecision"
      | "findDecision"
      | "createOverrideDecision"
      | "approveDecision"
      | "rejectDecision"
      | "auditDepartmentApproval"
    > = bookingsRepository,
    private readonly engine: Pick<
      EngineClient,
      "checkBookingDraft" | "decideBookings" | "validate"
    > = createEngine(),
    private readonly jobs: Pick<
      JobService,
      "process" | "resumeQueued"
    > = jobService,
  ) {
    this.decisionJob = (job) => this.decideFromJob(job);
  }

  async create(actor: RequestUser, body: BookingBody) {
    const { dataset, priority } = await this.activeDatasetAndPriority();
    const requester = await this.requireRequester(actor.id);
    const category = effectiveCategory(
      body.requestedCategory,
      roleCategoryCap(dataset.data, actor.role),
      priorityOrderFor(dataset.data, priority),
    );
    return this.repository.createRequest(
      inputFor(
        actor,
        this.requesterName(requester),
        dataset.id,
        body,
        category,
      ),
      this.actor(actor),
    );
  }

  async checkDraft(actor: RequestUser, body: BookingBody) {
    const { dataset, priority } = await this.activeDatasetAndPriority();
    const timetable = await this.requirePublishedTimetable(dataset.id);
    const requester = await this.requireRequester(actor.id);
    const category = effectiveCategory(
      body.requestedCategory,
      roleCategoryCap(dataset.data, actor.role),
      priorityOrderFor(dataset.data, priority),
    );
    const draft = inputFor(
      actor,
      this.requesterName(requester),
      dataset.id,
      body,
      category,
    );
    const [requests, activeOverrides, currentDecisions] = await Promise.all([
      this.repository.findAllForDataset(dataset.id),
      this.repository.findOverridesForValidation(dataset.id),
      this.repository.findCurrentDecisions(dataset.id),
    ]);
    return this.engine.checkBookingDraft(
      this.datasetWithBookingInputs(
        dataset.data,
        priority,
        requests,
        requests
          .filter((request) => request.status === RequestStatus.CANCELLED)
          .map((request) => ({
            request_id: request.id,
            external_id: request.externalId,
          })),
        undefined,
        activeOverrides,
        currentDecisions,
      ),
      timetable.schedule,
      this.bookingDraftForEngine(draft),
    );
  }

  async list(actor: RequestUser, query: BookingListQuery) {
    const { dataset } = await this.activeDatasetAndPriority();
    const records = await this.repository.listCandidates(dataset.id, query);
    const scoped = this.scopeRecords(records, actor, dataset.data);
    const start = (query.page - 1) * query.limit;
    return {
      items: scoped.slice(start, start + query.limit).map(mapBookingFromList),
      total: scoped.length,
      page: query.page,
      limit: query.limit,
    };
  }

  async getById(id: string, actor: RequestUser) {
    const { dataset } = await this.activeDatasetAndPriority();
    const record = await this.repository.findById(id);
    if (
      !record ||
      record.datasetId !== dataset.id ||
      !this.isInScope(record, actor, dataset.data)
    ) {
      throw new NotFoundError("The booking request was not found.");
    }
    return {
      ...record,
      currentDecision:
        record.decisions.find((decision) => decision.isCurrent) ?? null,
      decisions: record.decisions,
      requesterDepartment: record.requester?.department ?? null,
    };
  }

  async getSeries(seriesId: string, actor: RequestUser) {
    const { dataset } = await this.activeDatasetAndPriority();
    const records = await this.repository.findBySeries(dataset.id, seriesId);
    return records.filter((record) =>
      this.isInScope(record, actor, dataset.data),
    );
  }

  async update(id: string, actor: RequestUser, body: BookingPatchBody) {
    const { dataset, priority } = await this.activeDatasetAndPriority();
    const record = await this.requireScopedRecord(
      id,
      actor,
      dataset.data,
      dataset.id,
    );
    if (
      record.requesterId !== actor.id ||
      record.status !== RequestStatus.SUBMITTED
    ) {
      throw new ConflictError(
        "Only the owner can edit a submitted request.",
        "STALE_STATE",
      );
    }
    let cap: BookingCategory | undefined;
    if (body.requestedCategory !== undefined) {
      cap = effectiveCategory(
        body.requestedCategory,
        roleCategoryCap(dataset.data, actor.role),
        priorityOrderFor(dataset.data, priority),
      );
    }
    return this.repository.updateRequest(id, this.actor(actor), {
      ...body,
      ...(cap ? { effectiveCategory: cap } : {}),
    });
  }

  async cancel(id: string, actor: RequestUser, note: string) {
    const { dataset } = await this.activeDatasetAndPriority();
    await this.requireScopedRecord(id, actor, dataset.data, dataset.id);
    return this.repository.cancelRequest(id, this.actor(actor), note);
  }

  async queueDecisions(actor: RequestUser, requestId?: string) {
    const { dataset } = await this.activeDatasetAndPriority();
    const timetable = await this.requirePublishedTimetable(dataset.id);
    if (requestId) {
      const request = await this.repository.findById(requestId);
      if (!request || request.datasetId !== dataset.id) {
        throw new NotFoundError("The booking request was not found.");
      }
      if (request.status === RequestStatus.CANCELLED) {
        throw new ConflictError(
          "A cancelled request cannot be decided.",
          "STALE_STATE",
        );
      }
    }
    const job = await this.repository.enqueueDecision(
      this.actor(actor),
      dataset.id,
      timetable.id,
      requestId,
    );
    void this.jobs.process(job.id, this.decisionJob);
    return { jobId: job.id };
  }

  async resumeQueuedJobs(): Promise<void> {
    await this.jobs.resumeQueued(JobKind.DECIDE_BOOKINGS, this.decisionJob);
  }

  async manual(actor: RequestUser, body: BookingManualBody) {
    const { dataset, priority } = await this.activeDatasetAndPriority();
    const timetable = await this.requirePublishedTimetable(dataset.id);
    this.assertCoordinatorRoomScope(
      actor,
      body.roomId,
      [],
      dataset.data,
    );
    if (actor.role === Role.COORDINATOR) {
      const scope = groupAndRoomIdsForDepartment(
        dataset.data,
        actor.department ?? "",
      );
      if (body.mandatoryForGroups.some((group) => !scope.groups.has(group))) {
        throw new NotFoundError(
          "The booking request is outside your department scope.",
        );
      }
    }
    const category = effectiveCategory(
      body.requestedCategory,
      roleCategoryCap(dataset.data, actor.role),
      priorityOrderFor(dataset.data, priority),
    );
    const input = inputFor(
      actor,
      actor.role === Role.COORDINATOR
        ? `Department ${actor.department ?? "Institute"}`
        : "CIT Administration",
      dataset.id,
      body,
      category,
    );
    input.requesterId = null;
    const allRequests = await this.repository.findAllForDataset(dataset.id);
    const activeOverrides = await this.repository.findOverridesForValidation(
      dataset.id,
    );
    const currentDecisions = await this.repository.findCurrentDecisions(
      dataset.id,
    );
    const engineDataset = this.datasetWithBookingInputs(
      dataset.data,
      priority,
      allRequests,
      [],
      undefined,
      activeOverrides,
      currentDecisions,
    );
    const validation = await this.engine.validate(
      this.withManualBooking(
        this.withPublishedTimetable(engineDataset, timetable.schedule),
        input,
        body,
      ),
    );
    if (validation.report.hard_violation_count > 0) {
      throw new ValidationError(
        "The manual booking violates scheduling rules.",
        "SCHEDULE_RULE_VIOLATION",
        validation.report,
      );
    }
    return this.repository.addManualDecision(
      input,
      this.actor(actor),
      timetable.id,
      body,
    );
  }

  async override(
    id: string,
    actor: RequestUser,
    body: BookingDecisionBody & { reason: string },
  ) {
    const { dataset, priority } = await this.activeDatasetAndPriority();
    const timetable = await this.requirePublishedTimetable(dataset.id);
    const request = await this.repository.findById(id);
    if (!request || request.datasetId !== dataset.id) {
      throw new NotFoundError("The booking request was not found.");
    }
    if (request.requesterId === actor.id) {
      throw new ForbiddenError(
        "An Admin cannot override their own booking request.",
        "SELF_APPROVAL_NOT_ALLOWED",
      );
    }
    if (request.status === RequestStatus.CANCELLED) {
      throw new ConflictError(
        "A cancelled request cannot be approved.",
        "STALE_STATE",
      );
    }
    const allRequests = await this.repository.findAllForDataset(dataset.id);
    const activeOverrides = await this.repository.findOverridesForValidation(
      dataset.id,
    );
    const currentDecisions = await this.repository.findCurrentDecisions(
      dataset.id,
    );
    const validation = await this.engine.validate(
      this.withPublishedTimetable(
        this.datasetWithBookingInputs(
          dataset.data,
          priority,
          allRequests,
          [],
          { requestId: id, decision: body },
          activeOverrides,
          currentDecisions,
        ),
        timetable.schedule,
      ),
    );
    if (validation.report.hard_violation_count > 0) {
      throw new ValidationError(
        "The Admin override violates scheduling rules.",
        "SCHEDULE_RULE_VIOLATION",
        validation.report,
      );
    }
    return this.repository.createOverrideDecision(
      id,
      timetable.id,
      this.actor(actor),
      {
        status: body.status,
        reason: body.reason,
        ...(body.day === undefined ? {} : { day: body.day }),
        ...(body.startPeriod === undefined
          ? {}
          : { startPeriod: body.startPeriod }),
        ...(body.endPeriod === undefined ? {} : { endPeriod: body.endPeriod }),
        ...(body.roomId === undefined ? {} : { roomId: body.roomId }),
      },
    );
  }

  async approveDecision(id: string, actor: RequestUser) {
    const { dataset, priority } = await this.activeDatasetAndPriority();
    const timetable = await this.requirePublishedTimetable(dataset.id);
    const decision = await this.repository.findDecision(id);
    if (!decision || decision.request.datasetId !== dataset.id) {
      throw new NotFoundError("The booking decision was not found.");
    }
    if (decision.approvalState !== ApprovalState.PENDING_ADMIN) {
      throw new ConflictError(
        "The decision is not pending Admin approval.",
        "STALE_STATE",
      );
    }
    if (decision.request.requesterId === actor.id) {
      throw new ForbiddenError(
        "An Admin cannot approve their own booking request.",
        "SELF_APPROVAL_NOT_ALLOWED",
      );
    }
    if (decision.request.status === RequestStatus.CANCELLED) {
      throw new ConflictError(
        "A cancelled request cannot be approved.",
        "STALE_STATE",
      );
    }
    const allRequests = await this.repository.findAllForDataset(dataset.id);
    const [validationOverrides, currentDecisions] = await Promise.all([
      this.repository.findOverridesForValidation(dataset.id, decision.id),
      this.repository.findCurrentDecisions(dataset.id),
    ]);
    const datasetInput = this.datasetWithBookingInputs(
      dataset.data,
      priority,
      allRequests,
      [],
      undefined,
      validationOverrides,
      currentDecisions,
    );
    const validation = await this.engine.validate(
      this.withPublishedTimetable(datasetInput, timetable.schedule),
    );
    if (validation.report.hard_violation_count > 0) {
      throw new ValidationError(
        "The booking overrides no longer pass the official validator.",
        "SCHEDULE_RULE_VIOLATION",
        validation.report,
      );
    }
    if (timetable.id !== decision.timetableId) {
      throw new ConflictError(
        "The published timetable changed before approval.",
        "STALE_STATE",
      );
    }
    return this.repository.approveDecision(id, this.actor(actor));
  }

  rejectDecision(id: string, actor: RequestUser, reason: string) {
    return this.repository.rejectDecision(id, this.actor(actor), reason);
  }

  async deptApprove(id: string, actor: RequestUser) {
    const { dataset } = await this.activeDatasetAndPriority();
    const decision = await this.repository.findDecision(id);
    if (!decision || decision.request.datasetId !== dataset.id) {
      throw new NotFoundError("The booking decision was not found.");
    }
    if (!this.isLabBooking(decision.request, dataset.data)) {
      throw new ForbiddenError("Department approval is only for lab bookings.");
    }
    this.assertCoordinatorRoomScope(
      actor,
      decision.request.requestedRoom ?? "",
      decision.request.mandatoryForGroups,
      dataset.data,
    );
    return this.repository.auditDepartmentApproval(id, this.actor(actor));
  }

  private async decideFromJob(
    job: Job & { createdBy?: { role: Role } | null },
  ) {
    const params = this.readJobParams(job.params);
    const dataset = await this.repository.findDatasetById(params.datasetId);
    if (!dataset)
      throw new ConflictError("The job dataset was not found.", "STALE_STATE");
    const timetable = await this.repository.findPublishedTimetableById(
      params.datasetId,
      params.timetableId,
    );
    if (!timetable) {
      throw new ConflictError(
        "The published timetable for this job is no longer available.",
        "STALE_STATE",
      );
    }
    const [prioritySetting, requests, activeOverrides, currentDecisions] =
      await Promise.all([
        this.repository.findPriorityOrder(),
        this.repository.findAllForDataset(params.datasetId),
        this.repository.findOverridesForValidation(params.datasetId),
        this.repository.findCurrentDecisions(params.datasetId),
      ]);
    let targetRequests = requests;
    if (params.requestId) {
      targetRequests = requests.filter(
        (request) => request.id === params.requestId,
      );
      if (
        targetRequests.length !== 1 ||
        targetRequests[0]?.status === RequestStatus.CANCELLED
      ) {
        throw new ConflictError(
          "The booking request can no longer be decided.",
          "STALE_STATE",
        );
      }
    }
    const cancellations = requests
      .filter((request) => request.status === RequestStatus.CANCELLED)
      .map((request) => ({
        request_id: request.id,
        external_id: request.externalId,
      }));
    const engineDatasetBase = this.datasetWithBookingInputs(
      dataset.data,
      prioritySetting?.value,
      requests,
      cancellations,
      undefined,
      activeOverrides,
      currentDecisions,
    );
    const engineDataset = params.requestId
      ? {
          ...engineDatasetBase,
          target_request_ids: [params.requestId],
        }
      : engineDatasetBase;
    const result = await this.engine.decideBookings(
      engineDataset,
      timetable.schedule,
    );
    if (result.report.hard_violation_count > 0) {
      throw new ValidationError(
        "The booking engine reported hard violations.",
        "SCHEDULE_RULE_VIOLATION",
        result.report,
      );
    }
    const normalized = this.normalizeEngineDecisions(result);
    const expected = new Set(
      targetRequests
        .filter((request) => request.status !== RequestStatus.CANCELLED)
        .map((request) => request.id),
    );
    const received = new Set(normalized.map((decision) => decision.request_id));
    if ([...expected].some((id) => !received.has(id))) {
      throw new ValidationError(
        "The booking engine omitted one or more requested decisions.",
        "ENGINE_OUTPUT_INVALID",
      );
    }

    return {
      resultType: "BookingDecision",
      persist: async (tx: Prisma.TransactionClient, claimedJob: Job) => {
        const ids = await this.repository.persistEngineDecisions(
          tx,
          params.datasetId,
          params.timetableId,
          normalized.filter((decision) => expected.has(decision.request_id)),
          {
            id: claimedJob.createdById,
            role: job.createdBy?.role ?? null,
          },
        );
        return ids[0] ?? params.datasetId;
      },
    };
  }

  private normalizeEngineDecisions(
    result: Awaited<ReturnType<EngineClient["decideBookings"]>>,
  ) {
    const overridesByRequest = new Map<
      string,
      Array<{
        session_id: string;
        from_day: string;
        from_start: number;
        from_room: string;
        to_day: string;
        to_start: number;
        to_room: string;
      }>
    >();
    for (const move of result.session_overrides) {
      const requestId = this.requiredString(
        move.request_id,
        "session_overrides.request_id",
      );
      const normalized = {
        session_id: this.requiredString(
          move.session_id,
          "session_overrides.session_id",
        ),
        from_day: this.requiredString(
          move.from_day,
          "session_overrides.from_day",
        ),
        from_start: this.requiredNumber(
          move.from_start,
          "session_overrides.from_start",
        ),
        from_room: this.requiredString(
          move.from_room,
          "session_overrides.from_room",
        ),
        to_day: this.requiredString(move.to_day, "session_overrides.to_day"),
        to_start: this.requiredNumber(
          move.to_start,
          "session_overrides.to_start",
        ),
        to_room: this.requiredString(move.to_room, "session_overrides.to_room"),
      };
      overridesByRequest.set(requestId, [
        ...(overridesByRequest.get(requestId) ?? []),
        normalized,
      ]);
    }
    return result.decisions.map((value) => {
      const requestId = this.requiredString(
        value.request_id,
        "decisions.request_id",
      );
      const status = Object.values(DecisionStatus).find(
        (candidate) => candidate === value.status,
      );
      if (!status) {
        throw new ValidationError(
          "The booking engine returned an unknown decision status.",
          "ENGINE_OUTPUT_INVALID",
          { request_id: requestId },
        );
      }
      const reason =
        typeof value.reason === "string" ? value.reason.trim() : "";
      if (status !== DecisionStatus.APPROVED && !reason) {
        throw new ValidationError(
          "Every non-approved booking decision must include a reason.",
          "ENGINE_OUTPUT_INVALID",
          { request_id: requestId },
        );
      }
      return {
        request_id: requestId,
        status,
        day: typeof value.day === "string" ? value.day : null,
        start_period:
          typeof value.start_period === "number" ? value.start_period : null,
        end_period:
          typeof value.end_period === "number" ? value.end_period : null,
        room_id: typeof value.room_id === "string" ? value.room_id : null,
        reason,
        session_overrides: overridesByRequest.get(requestId) ?? [],
      };
    });
  }

  private datasetWithBookingInputs(
    data: Prisma.JsonValue,
    priority: Prisma.JsonValue | undefined,
    requests: Array<{
      id: string;
      externalId: string;
      requesterId: string | null;
      requesterName: string;
      requesterRole: Role;
      requestedCategory: BookingCategory;
      effectiveCategory: BookingCategory;
      title: string;
      attendance: number;
      durationPeriods: number;
      windows: Prisma.JsonValue;
      roomTypes: string[];
      needs: string[];
      requestedRoom: string | null;
      mandatoryForGroups: string[];
      seriesId: string | null;
      rawText: string | null;
      status: RequestStatus;
      cancelledAt: Date | null;
      cancelNote: string | null;
    }>,
    cancellations: Array<{ request_id: string; external_id: string }>,
    replacement?: {
      requestId: string;
      decision: BookingDecisionBody;
    },
    sessionOverrides: Array<{
      sessionId: string;
      fromDay: string;
      fromStart: number;
      fromRoom: string;
      toDay: string;
      toStart: number;
      toRoom: string;
    }> = [],
    currentDecisions: Array<{
      requestId: string;
      status: DecisionStatus;
      day: string | null;
      startPeriod: number | null;
      endPeriod: number | null;
      roomId: string | null;
      reason: string;
      request: { externalId: string; status: RequestStatus };
    }> = [],
  ): Prisma.InputJsonObject {
    const base = toDatasetObject(data);
    return {
      ...base,
      ...(priority === undefined ? {} : { priority_order: priority }),
      booking_requests: requests.map((request) => ({
        request_id: request.id,
        id: request.id,
        external_id: request.externalId,
        requester_id: request.requesterId,
        requester_name: request.requesterName,
        requester_role: request.requesterRole,
        requested_category: request.requestedCategory,
        effective_category: request.effectiveCategory,
        title: request.title,
        attendance: request.attendance,
        duration_periods: request.durationPeriods,
        windows: request.windows,
        room_types: request.roomTypes,
        needs: request.needs,
        requested_room: request.requestedRoom,
        mandatory_for_groups: request.mandatoryForGroups,
        series_id: request.seriesId,
        raw_text: request.rawText,
        status: request.status,
        cancelled_at: request.cancelledAt?.toISOString() ?? null,
        cancel_note: request.cancelNote,
        ...(replacement?.requestId === request.id
          ? {
              proposed_decision: {
                status: replacement.decision.status,
                day: replacement.decision.day ?? null,
                start_period: replacement.decision.startPeriod ?? null,
                end_period: replacement.decision.endPeriod ?? null,
                room_id: replacement.decision.roomId ?? null,
                reason: replacement.decision.reason ?? null,
              },
            }
          : {}),
      })),
      cancellations,
      booking_decisions: currentDecisions.map((decision) => ({
        request_id: decision.requestId,
        external_id: decision.request.externalId,
        request_status: decision.request.status,
        status: decision.status,
        day: decision.day,
        start_period: decision.startPeriod,
        end_period: decision.endPeriod,
        room_id: decision.roomId,
        reason: decision.reason,
      })),
      session_overrides: sessionOverrides.map((override) => ({
        session_id: override.sessionId,
        from_day: override.fromDay,
        from_start: override.fromStart,
        from_room: override.fromRoom,
        to_day: override.toDay,
        to_start: override.toStart,
        to_room: override.toRoom,
      })),
    };
  }

  private bookingDraftForEngine(input: BookingInput): Prisma.InputJsonObject {
    return {
      request_id: input.externalId ?? null,
      requester_id: input.requesterId,
      requester_name: input.requesterName,
      requester_role: input.requesterRole,
      requested_category: input.requestedCategory,
      effective_category: input.effectiveCategory,
      title: input.title,
      attendance: input.attendance,
      duration_periods: input.durationPeriods,
      windows: input.windows,
      room_types: input.roomTypes,
      needs: input.needs,
      requested_room: input.requestedRoom ?? null,
      mandatory_for_groups: input.mandatoryForGroups,
      series_id: input.seriesId ?? null,
    };
  }

  private withManualBooking(
    dataset: Prisma.InputJsonObject,
    input: BookingInput,
    body: BookingManualBody,
  ): Prisma.InputJsonObject {
    return {
      ...dataset,
      booking_requests: [
        ...(Array.isArray(dataset.booking_requests)
          ? dataset.booking_requests
          : []),
        {
          ...this.bookingDraftForEngine(input),
          proposed_decision: {
            status: DecisionStatus.APPROVED,
            day: body.day,
            start_period: body.startPeriod,
            end_period: body.endPeriod,
            room_id: body.roomId,
            reason: body.reason,
          },
        },
      ],
    };
  }

  private withPublishedTimetable(
    dataset: Prisma.InputJsonObject,
    schedule: Prisma.JsonValue,
  ): Prisma.InputJsonObject {
    return { ...dataset, published_timetable: schedule };
  }

  private async activeDatasetAndPriority() {
    const dataset = await this.repository.findActiveDataset();
    if (!dataset)
      throw new ConflictError(
        "There is no active dataset.",
        "NO_ACTIVE_DATASET",
      );
    const priority = await this.repository.findPriorityOrder();
    return { dataset, priority: priority?.value };
  }

  private async requirePublishedTimetable(datasetId: string) {
    const timetable = await this.repository.findPublishedTimetable(datasetId);
    if (!timetable) {
      throw new ConflictError(
        "There is no published timetable for the active dataset.",
        "NO_PUBLISHED_TIMETABLE",
      );
    }
    return timetable;
  }

  private async requireRequester(id: string) {
    const requester = await this.repository.findRequester(id);
    if (!requester) throw new NotFoundError("The requester was not found.");
    return requester;
  }

  private requesterName(requester: {
    name: string;
    clubName: string | null;
    role: Role;
  }) {
    return requester.role === Role.CLUB
      ? (requester.clubName ?? requester.name)
      : requester.name;
  }

  private actor(user: RequestUser): BookingActor {
    return { id: user.id, role: user.role, department: user.department };
  }

  private async requireScopedRecord(
    id: string,
    actor: RequestUser,
    data: Prisma.JsonValue,
    datasetId: string,
  ) {
    const record = await this.repository.findById(id);
    if (
      !record ||
      record.datasetId !== datasetId ||
      !this.isInScope(record, actor, data)
    ) {
      throw new NotFoundError("The booking request was not found.");
    }
    return record;
  }

  private scopeRecords<
    T extends {
      requesterId: string | null;
      requester: { department: string | null } | null;
      requestedRoom: string | null;
      mandatoryForGroups: string[];
    },
  >(records: T[], actor: RequestUser, data: Prisma.JsonValue): T[] {
    if (actor.role === Role.ADMIN) return records;
    if (actor.role !== Role.COORDINATOR) {
      return records.filter((record) => record.requesterId === actor.id);
    }
    const scope = groupAndRoomIdsForDepartment(data, actor.department ?? "");
    return records.filter(
      (record) =>
        record.requester?.department === actor.department ||
        (record.requestedRoom !== null &&
          scope.rooms.has(record.requestedRoom)) ||
        record.mandatoryForGroups.some((group) => scope.groups.has(group)),
    );
  }

  private isInScope(
    record: {
      requesterId: string | null;
      requestedRoom: string | null;
      mandatoryForGroups: string[];
      requester: { department: string | null } | null;
    },
    actor: RequestUser,
    data: Prisma.JsonValue,
  ): boolean {
    if (actor.role === Role.ADMIN) return true;
    if (actor.role !== Role.COORDINATOR) return record.requesterId === actor.id;
    const scope = groupAndRoomIdsForDepartment(data, actor.department ?? "");
    return (
      record.requester?.department === actor.department ||
      (record.requestedRoom !== null &&
        scope.rooms.has(record.requestedRoom)) ||
      record.mandatoryForGroups.some((group) => scope.groups.has(group))
    );
  }

  private assertCoordinatorRoomScope(
    actor: RequestUser,
    roomId: string,
    groups: string[],
    dataset: Prisma.JsonValue,
  ) {
    if (actor.role !== Role.COORDINATOR) return;
    const scope = groupAndRoomIdsForDepartment(dataset, actor.department ?? "");
    if (
      !scope.rooms.has(roomId) &&
      !groups.some((group) => scope.groups.has(group))
    ) {
      throw new NotFoundError(
        "The booking request is outside your department scope.",
      );
    }
  }

  private isLabBooking(
    request:
      | NonNullable<BookingRecord>
      | { requestedRoom: string | null; roomTypes: string[]; needs: string[] },
    dataset: Prisma.JsonValue,
  ) {
    if (
      request.roomTypes.some((type) => type.toLowerCase().includes("lab")) ||
      request.needs.some((need) => need.toLowerCase().includes("lab"))
    ) {
      return true;
    }
    if (
      !request.requestedRoom ||
      !isRecord(dataset) ||
      !Array.isArray(dataset.rooms)
    ) {
      return false;
    }
    return dataset.rooms.some(
      (room) =>
        isRecord(room) &&
        stringAt(room, ["room_id", "id"]) === request.requestedRoom &&
        (stringAt(room, ["type", "room_type"]) ?? "")
          .toLowerCase()
          .includes("lab"),
    );
  }

  private readJobParams(params: Prisma.JsonValue | null) {
    if (!params || !isRecord(params)) {
      throw new ValidationError(
        "The booking job has invalid parameters.",
        "DATASET_INVALID",
      );
    }
    const datasetId =
      typeof params.datasetId === "string" ? params.datasetId : null;
    const timetableId =
      typeof params.timetableId === "string" ? params.timetableId : null;
    const requestId =
      params.requestId === null
        ? null
        : typeof params.requestId === "string"
          ? params.requestId
          : null;
    if (
      !datasetId ||
      !timetableId ||
      (params.requestId !== null && !requestId)
    ) {
      throw new ValidationError(
        "The booking job has invalid parameters.",
        "DATASET_INVALID",
      );
    }
    return { datasetId, timetableId, requestId };
  }

  private requiredString(
    value: Prisma.JsonValue | undefined,
    key: string,
  ): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new ValidationError(
        `The booking engine omitted ${key}.`,
        "ENGINE_OUTPUT_INVALID",
      );
    }
    return value;
  }

  private requiredNumber(
    value: Prisma.JsonValue | undefined,
    key: string,
  ): number {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new ValidationError(
        `The booking engine returned an invalid ${key}.`,
        "ENGINE_OUTPUT_INVALID",
      );
    }
    return value;
  }
}

export const bookingsService = new BookingsService(
  new BookingsRepository(prisma),
  createEngine(),
);
