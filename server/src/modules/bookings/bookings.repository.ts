import {
  ApprovalState,
  BookingCategory,
  DecisionSource,
  DecisionStatus,
  JobKind,
  Prisma,
  PublishStatus,
  RequestStatus,
  Role,
  type PrismaClient,
} from "@prisma/client";
import { audit } from "../../audit/audit.service.js";
import { prisma } from "../../lib/prisma.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../utils/api-error.js";
import type {
  BookingBody,
  BookingListQuery,
  BookingManualBody,
  BookingPatchBody,
} from "./bookings.schema.js";

export type BookingActor = {
  id: string;
  role: Role;
  department: string | null;
};
export type BookingInput = {
  datasetId: string;
  requesterId: string | null;
  requesterName: string;
  requesterRole: Role;
  requestedCategory: BookingCategory;
  effectiveCategory: BookingCategory;
  submittedAt: Date;
  externalId?: string;
  status?: RequestStatus;
} & BookingBody;

const requestSelection = {
  id: true,
  datasetId: true,
  externalId: true,
  requesterId: true,
  requesterName: true,
  requesterRole: true,
  requestedCategory: true,
  effectiveCategory: true,
  title: true,
  attendance: true,
  durationPeriods: true,
  windows: true,
  roomTypes: true,
  needs: true,
  requestedRoom: true,
  mandatoryForGroups: true,
  seriesId: true,
  rawText: true,
  llmDraft: true,
  submittedAt: true,
  status: true,
  cancelledAt: true,
  cancelNote: true,
  createdAt: true,
} satisfies Prisma.BookingRequestSelect;

type EngineDecision = {
  request_id: string;
  status: DecisionStatus;
  day: string | null;
  start_period: number | null;
  end_period: number | null;
  room_id: string | null;
  reason: string;
  session_overrides: Array<{
    session_id: string;
    from_day: string;
    from_start: number;
    from_room: string;
    to_day: string;
    to_start: number;
    to_room: string;
  }>;
};

export class BookingsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  findActiveDataset() {
    return this.client.dataset.findFirst({
      where: { isActive: true },
      select: { id: true, data: true },
    });
  }

  findDatasetById(id: string) {
    return this.client.dataset.findUnique({
      where: { id },
      select: { id: true, data: true },
    });
  }

  findRequester(id: string) {
    return this.client.user.findUnique({
      where: { id },
      select: { id: true, name: true, clubName: true, role: true },
    });
  }

  findPriorityOrder() {
    return this.client.appSetting.findUnique({
      where: { key: "priority_order" },
      select: { value: true },
    });
  }

  findPublishedTimetable(datasetId: string) {
    return this.client.timetable.findFirst({
      where: { datasetId, status: PublishStatus.PUBLISHED },
      orderBy: { publishedAt: "desc" },
      select: { id: true, schedule: true },
    });
  }

  findPublishedTimetableById(datasetId: string, id: string) {
    return this.client.timetable.findFirst({
      where: { id, datasetId, status: PublishStatus.PUBLISHED },
      select: { id: true, schedule: true },
    });
  }

  async listCandidates(datasetId: string, query: BookingListQuery) {
    return this.client.bookingRequest.findMany({
      where: {
        datasetId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.category ? { effectiveCategory: query.category } : {}),
        ...(query.seriesId ? { seriesId: query.seriesId } : {}),
        ...(query.q
          ? { title: { contains: query.q, mode: "insensitive" } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        ...requestSelection,
        requester: { select: { department: true } },
        decisions: {
          where: { isCurrent: true },
          select: {
            id: true,
            day: true,
            roomId: true,
            status: true,
            approvalState: true,
            isCurrent: true,
          },
        },
      },
    });
  }

  findAllForDataset(datasetId: string) {
    return this.client.bookingRequest.findMany({
      where: { datasetId },
      orderBy: { submittedAt: "asc" },
      select: requestSelection,
    });
  }

  findOverridesForValidation(datasetId: string, pendingDecisionId?: string) {
    return this.client.sessionOverride.findMany({
      where: {
        decision: {
          request: { datasetId, status: { not: RequestStatus.CANCELLED } },
          OR: [
            { approvalState: ApprovalState.APPROVED },
            ...(pendingDecisionId ? [{ id: pendingDecisionId }] : []),
          ],
        },
      },
      select: {
        sessionId: true,
        decision: { select: { requestId: true } },
        fromDay: true,
        fromStart: true,
        fromRoom: true,
        toDay: true,
        toStart: true,
        toRoom: true,
      },
    });
  }

  findCurrentDecisions(datasetId: string) {
    return this.client.bookingDecision.findMany({
      where: {
        isCurrent: true,
        request: { datasetId, status: { not: RequestStatus.CANCELLED } },
      },
      select: {
        requestId: true,
        status: true,
        day: true,
        startPeriod: true,
        endPeriod: true,
        roomId: true,
        reason: true,
        request: { select: { externalId: true, status: true } },
      },
    });
  }

  async findById(id: string) {
    return this.client.bookingRequest.findUnique({
      where: { id },
      select: {
        ...requestSelection,
        requester: { select: { department: true } },
        decisions: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            requestId: true,
            timetableId: true,
            status: true,
            day: true,
            startPeriod: true,
            endPeriod: true,
            roomId: true,
            reason: true,
            source: true,
            decidedById: true,
            approvalState: true,
            approvedById: true,
            approvedAt: true,
            isCurrent: true,
            createdAt: true,
            overrides: true,
          },
        },
      },
    });
  }

  findBySeries(datasetId: string, seriesId: string) {
    return this.client.bookingRequest.findMany({
      where: { datasetId, seriesId },
      orderBy: { submittedAt: "asc" },
      select: {
        ...requestSelection,
        requester: { select: { department: true } },
        decisions: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            day: true,
            startPeriod: true,
            endPeriod: true,
            roomId: true,
            reason: true,
            source: true,
            approvalState: true,
            isCurrent: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async createRequest(input: BookingInput, actor: BookingActor) {
    return this.client.$transaction(
      async (tx) => {
        const externalId =
          input.externalId ?? (await this.nextExternalId(tx, input.datasetId));
        const request = await tx.bookingRequest.create({
          data: this.toCreateInput(input, externalId),
          select: requestSelection,
        });
        await audit(tx, {
          actorId: actor.id,
          actorRole: actor.role,
          action: "BOOKING_REQUEST_CREATED",
          entityType: "BookingRequest",
          entityId: request.id,
          summary: "A booking request was submitted.",
          details: { externalId, requestedCategory: input.requestedCategory },
        });
        return request;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateRequest(
    id: string,
    actor: BookingActor,
    input: BookingPatchBody & {
      effectiveCategory?: BookingCategory;
    },
  ) {
    return this.client.$transaction(async (tx) => {
      const current = await tx.bookingRequest.findUnique({
        where: { id },
        select: { requesterId: true, status: true },
      });
      if (!current)
        throw new NotFoundError("The booking request was not found.");
      if (
        current.requesterId !== actor.id ||
        current.status !== RequestStatus.SUBMITTED
      ) {
        throw new ConflictError(
          "Only the owner can edit a submitted booking request.",
          "STALE_STATE",
        );
      }

      const updated = await tx.bookingRequest.update({
        where: { id },
        data: this.toUpdateInput(input),
        select: requestSelection,
      });
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "BOOKING_REQUEST_UPDATED",
        entityType: "BookingRequest",
        entityId: id,
        summary: "A submitted booking request was updated.",
      });
      return updated;
    });
  }

  async cancelRequest(id: string, actor: BookingActor, note: string) {
    return this.client.$transaction(async (tx) => {
      const current = await tx.bookingRequest.findUnique({
        where: { id },
        select: {
          requesterId: true,
          status: true,
          requester: { select: { department: true } },
        },
      });
      if (!current)
        throw new NotFoundError("The booking request was not found.");
      const isOwner = current.requesterId === actor.id;
      const isDepartmentCoordinator =
        actor.role === Role.COORDINATOR &&
        !!actor.department &&
        current.requester?.department === actor.department;
      if (actor.role !== Role.ADMIN && !isOwner && !isDepartmentCoordinator) {
        throw new NotFoundError("The booking request was not found.");
      }
      if (current.status === RequestStatus.CANCELLED) {
        throw new ConflictError(
          "The booking request is already cancelled.",
          "STALE_STATE",
        );
      }

      await tx.bookingDecision.updateMany({
        where: { requestId: id, isCurrent: true },
        data: { isCurrent: false },
      });
      const updated = await tx.bookingRequest.update({
        where: { id },
        data: {
          status: RequestStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelNote: note,
        },
        select: requestSelection,
      });
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "BOOKING_REQUEST_CANCELLED",
        entityType: "BookingRequest",
        entityId: id,
        summary: "A booking request was cancelled.",
        details: { note },
      });
      return updated;
    });
  }

  async enqueueDecision(
    actor: BookingActor,
    datasetId: string,
    timetableId: string,
    requestId?: string,
  ) {
    return this.client.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          kind: JobKind.DECIDE_BOOKINGS,
          createdById: actor.id,
          params: { datasetId, timetableId, requestId: requestId ?? null },
        },
      });
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "JOB_QUEUED",
        entityType: "Job",
        entityId: job.id,
        summary: "Booking decisions were queued.",
        details: { datasetId, timetableId, requestId: requestId ?? null },
      });
      return job;
    });
  }

  async persistEngineDecisions(
    tx: Prisma.TransactionClient,
    datasetId: string,
    timetableId: string,
    decisions: EngineDecision[],
    actor: { id: string | null; role: Role | null },
  ) {
    const savedIds: string[] = [];
    for (const decision of decisions) {
      const request = await tx.bookingRequest.findFirst({
        where: {
          id: decision.request_id,
          datasetId,
          status: { not: RequestStatus.CANCELLED },
        },
        select: { id: true },
      });
      if (!request) continue;

      await tx.bookingDecision.updateMany({
        where: { requestId: request.id, isCurrent: true },
        data: { isCurrent: false },
      });
      const approvalState =
        decision.session_overrides.length > 0
          ? ApprovalState.PENDING_ADMIN
          : ApprovalState.NOT_REQUIRED;
      const saved = await tx.bookingDecision.create({
        data: {
          requestId: request.id,
          timetableId,
          status: decision.status,
          day: decision.day,
          startPeriod: decision.start_period,
          endPeriod: decision.end_period,
          roomId: decision.room_id,
          reason: decision.reason,
          source: DecisionSource.RULE_ENGINE,
          approvalState,
        },
      });
      for (const move of decision.session_overrides) {
        await tx.sessionOverride.create({
          data: {
            decisionId: saved.id,
            sessionId: move.session_id,
            fromDay: move.from_day,
            fromStart: move.from_start,
            fromRoom: move.from_room,
            toDay: move.to_day,
            toStart: move.to_start,
            toRoom: move.to_room,
          },
        });
      }

      const requestStatus =
        approvalState === ApprovalState.PENDING_ADMIN
          ? RequestStatus.SUBMITTED
          : this.requestStatusFor(decision.status);
      await tx.bookingRequest.update({
        where: { id: request.id },
        data: { status: requestStatus },
      });
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "BOOKING_DECIDED",
        entityType: "BookingRequest",
        entityId: request.id,
        summary: "The booking engine produced a decision.",
        details: {
          decisionId: saved.id,
          status: decision.status,
          approvalState,
        },
      });
      savedIds.push(request.id);
    }
    return savedIds;
  }

  async addManualDecision(
    input: BookingInput,
    actor: BookingActor,
    timetableId: string,
    details: {
      day: string;
      startPeriod: number;
      endPeriod: number;
      roomId: string;
      reason: string;
    },
  ) {
    return this.client.$transaction(
      async (tx) => {
        const externalId = await this.nextExternalId(tx, input.datasetId);
        const request = await tx.bookingRequest.create({
          data: this.toCreateInput(input, externalId),
        });
        const decision = await tx.bookingDecision.create({
          data: {
            requestId: request.id,
            timetableId,
            status: DecisionStatus.APPROVED,
            day: details.day,
            startPeriod: details.startPeriod,
            endPeriod: details.endPeriod,
            roomId: details.roomId,
            reason: details.reason,
            source: DecisionSource.MANUAL,
            approvalState: ApprovalState.NOT_REQUIRED,
          },
        });
        const updated = await tx.bookingRequest.update({
          where: { id: request.id },
          data: { status: RequestStatus.APPROVED },
          select: requestSelection,
        });
        await audit(tx, {
          actorId: actor.id,
          actorRole: actor.role,
          action: "BOOKING_MANUALLY_APPROVED",
          entityType: "BookingRequest",
          entityId: request.id,
          summary: "A booking request was manually scheduled.",
          details: { decisionId: decision.id, timetableId },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findDecision(id: string) {
    return this.client.bookingDecision.findUnique({
      where: { id },
      include: {
        request: {
          select: {
            ...requestSelection,
            requester: { select: { department: true } },
          },
        },
        overrides: true,
      },
    });
  }

  async createOverrideDecision(
    requestId: string,
    timetableId: string,
    actor: BookingActor,
    decision: {
      status: DecisionStatus;
      day?: string;
      startPeriod?: number;
      endPeriod?: number;
      roomId?: string;
      reason: string;
    },
  ) {
    return this.client.$transaction(async (tx) => {
      const request = await tx.bookingRequest.findUnique({
        where: { id: requestId },
        select: { id: true, datasetId: true, status: true, requesterId: true },
      });
      if (!request)
        throw new NotFoundError("The booking request was not found.");
      if (
        request.status === RequestStatus.CANCELLED ||
        request.status !== RequestStatus.SUBMITTED
      ) {
        throw new ConflictError(
          "Only a submitted booking request can be overridden.",
          "STALE_STATE",
        );
      }
      await tx.bookingDecision.updateMany({
        where: { requestId, isCurrent: true },
        data: { isCurrent: false },
      });
      const saved = await tx.bookingDecision.create({
        data: {
          requestId,
          timetableId,
          status: decision.status,
          day: decision.day ?? null,
          startPeriod: decision.startPeriod ?? null,
          endPeriod: decision.endPeriod ?? null,
          roomId: decision.roomId ?? null,
          reason: decision.reason,
          source: DecisionSource.ADMIN_OVERRIDE,
          decidedById: actor.id,
          approvalState: ApprovalState.NOT_REQUIRED,
        },
      });
      await tx.bookingRequest.update({
        where: { id: requestId },
        data: { status: this.requestStatusFor(decision.status) },
      });
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "BOOKING_OVERRIDE",
        entityType: "BookingRequest",
        entityId: requestId,
        summary: "An Admin overrode a booking decision.",
        details: { decisionId: saved.id, status: decision.status },
      });
      return saved;
    });
  }

  async approveDecision(
    id: string,
    actor: BookingActor,
    expectedState: ApprovalState = ApprovalState.PENDING_ADMIN,
  ) {
    return this.client.$transaction(async (tx) => {
      const decision = await tx.bookingDecision.findUnique({
        where: { id },
        select: {
          id: true,
          requestId: true,
          approvalState: true,
          request: { select: { requesterId: true, status: true } },
        },
      });
      if (!decision)
        throw new NotFoundError("The booking decision was not found.");
      if (decision.approvalState !== expectedState) {
        throw new ConflictError(
          "The booking decision is not in the expected approval state.",
          "STALE_STATE",
        );
      }
      if (
        decision.request.status === RequestStatus.CANCELLED ||
        decision.request.requesterId === actor.id
      ) {
        if (decision.request.status === RequestStatus.CANCELLED) {
          throw new ConflictError(
            "A cancelled request cannot be approved.",
            "STALE_STATE",
          );
        }
        throw new ForbiddenError(
          "An Admin cannot approve their own booking request.",
          "SELF_APPROVAL_NOT_ALLOWED",
        );
      }
      const changed = await tx.bookingDecision.updateMany({
        where: {
          id,
          isCurrent: true,
          approvalState: expectedState,
        },
        data: {
          approvalState: ApprovalState.APPROVED,
          approvedById: actor.id,
          approvedAt: new Date(),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictError("The booking decision changed.", "STALE_STATE");
      }
      await tx.bookingRequest.update({
        where: { id: decision.requestId },
        data: { status: RequestStatus.APPROVED },
      });
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "BOOKING_APPROVAL_APPROVED",
        entityType: "BookingDecision",
        entityId: id,
        summary: "An Admin approved the booking decision.",
      });
      return { id, approvalState: ApprovalState.APPROVED };
    });
  }

  async rejectDecision(id: string, actor: BookingActor, reason: string) {
    return this.client.$transaction(async (tx) => {
      const decision = await tx.bookingDecision.findUnique({
        where: { id },
        select: {
          id: true,
          requestId: true,
          approvalState: true,
          request: { select: { requesterId: true, status: true } },
        },
      });
      if (!decision)
        throw new NotFoundError("The booking decision was not found.");
      if (
        decision.approvalState !== ApprovalState.PENDING_ADMIN &&
        decision.approvalState !== ApprovalState.DEPT_APPROVED
      ) {
        throw new ConflictError(
          "The booking decision is not awaiting approval.",
          "STALE_STATE",
        );
      }
      if (
        decision.request.status === RequestStatus.CANCELLED ||
        decision.request.requesterId === actor.id
      ) {
        if (decision.request.status === RequestStatus.CANCELLED) {
          throw new ConflictError(
            "A cancelled request cannot be rejected.",
            "STALE_STATE",
          );
        }
        throw new ForbiddenError(
          "An Admin cannot reject their own booking request.",
          "SELF_APPROVAL_NOT_ALLOWED",
        );
      }
      const changed = await tx.bookingDecision.updateMany({
        where: {
          id,
          isCurrent: true,
          approvalState: { in: [ApprovalState.PENDING_ADMIN, ApprovalState.DEPT_APPROVED] },
        },
        data: {
          approvalState: ApprovalState.REJECTED,
          approvedById: actor.id,
          approvedAt: new Date(),
          reason,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictError("The booking decision changed.", "STALE_STATE");
      }
      await tx.bookingRequest.update({
        where: { id: decision.requestId },
        data: { status: RequestStatus.REJECTED },
      });
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "BOOKING_APPROVAL_REJECTED",
        entityType: "BookingDecision",
        entityId: id,
        summary: "An Admin rejected the booking decision.",
        details: { reason },
      });
      return { id, approvalState: ApprovalState.REJECTED };
    });
  }

  async auditDepartmentApproval(id: string, actor: BookingActor) {
    return this.client.$transaction(async (tx) => {
      const decision = await tx.bookingDecision.findUnique({
        where: { id },
        select: {
          id: true,
          approvalState: true,
          isCurrent: true,
          request: { select: { requesterId: true, status: true } },
        },
      });
      if (!decision) throw new NotFoundError("The booking decision was not found.");
      if (
        !decision.isCurrent ||
        decision.approvalState !== ApprovalState.PENDING_ADMIN ||
        decision.request.status === RequestStatus.CANCELLED
      ) {
        throw new ConflictError(
          "The booking decision is not pending department approval.",
          "STALE_STATE",
        );
      }
      if (decision.request.requesterId === actor.id) {
        throw new ForbiddenError(
          "A requester cannot approve their own booking.",
          "SELF_APPROVAL_NOT_ALLOWED",
        );
      }
      const changed = await tx.bookingDecision.updateMany({
        where: { id, isCurrent: true, approvalState: ApprovalState.PENDING_ADMIN },
        data: {
          approvalState: ApprovalState.DEPT_APPROVED,
          deptApprovedById: actor.id,
          deptApprovedAt: new Date(),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictError("The booking decision changed.", "STALE_STATE");
      }
      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "BOOKING_DEPARTMENT_APPROVED",
        entityType: "BookingDecision",
        entityId: id,
        summary: "A coordinator approved a lab booking for their department.",
      });
      return { id, approvalState: ApprovalState.DEPT_APPROVED };
    });
  }

  private requestStatusFor(status: DecisionStatus): RequestStatus {
    switch (status) {
      case DecisionStatus.APPROVED:
        return RequestStatus.APPROVED;
      case DecisionStatus.ALTERNATIVE_OFFERED:
        return RequestStatus.ALTERNATIVE_OFFERED;
      case DecisionStatus.REJECTED:
        return RequestStatus.REJECTED;
    }
  }

  private toCreateInput(input: BookingInput, externalId: string) {
    return {
      datasetId: input.datasetId,
      externalId,
      requesterId: input.requesterId,
      requesterName: input.requesterName,
      requesterRole: input.requesterRole,
      requestedCategory: input.requestedCategory,
      effectiveCategory: input.effectiveCategory,
      title: input.title,
      attendance: input.attendance,
      durationPeriods: input.durationPeriods,
      windows: input.windows,
      roomTypes: input.roomTypes,
      needs: input.needs,
      requestedRoom: input.requestedRoom ?? null,
      mandatoryForGroups: input.mandatoryForGroups,
      seriesId: input.seriesId ?? null,
      rawText: input.rawText ?? null,
      llmDraft: input.llmDraft === undefined ? Prisma.JsonNull : input.llmDraft,
      submittedAt: input.submittedAt,
      status: RequestStatus.SUBMITTED,
    };
  }

  private toUpdateInput(
    input: BookingPatchBody & { effectiveCategory?: BookingCategory },
  ) {
    return {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.attendance === undefined
        ? {}
        : { attendance: input.attendance }),
      ...(input.durationPeriods === undefined
        ? {}
        : { durationPeriods: input.durationPeriods }),
      ...(input.windows === undefined ? {} : { windows: input.windows }),
      ...(input.roomTypes === undefined ? {} : { roomTypes: input.roomTypes }),
      ...(input.needs === undefined ? {} : { needs: input.needs }),
      ...(input.requestedRoom === undefined
        ? {}
        : { requestedRoom: input.requestedRoom }),
      ...(input.mandatoryForGroups === undefined
        ? {}
        : { mandatoryForGroups: input.mandatoryForGroups }),
      ...(input.seriesId === undefined ? {} : { seriesId: input.seriesId }),
      ...(input.rawText === undefined ? {} : { rawText: input.rawText }),
      ...(input.llmDraft === undefined ? {} : { llmDraft: input.llmDraft }),
      ...(input.requestedCategory === undefined
        ? {}
        : { requestedCategory: input.requestedCategory }),
      ...(input.effectiveCategory === undefined
        ? {}
        : { effectiveCategory: input.effectiveCategory }),
    };
  }

  private async nextExternalId(
    tx: Prisma.TransactionClient,
    datasetId: string,
  ): Promise<string> {
    const ids = await tx.bookingRequest.findMany({
      where: { datasetId },
      select: { externalId: true },
    });
    const used = new Set(ids.map(({ externalId }) => externalId));
    let number = 1;
    while (used.has(`BR-${String(number).padStart(2, "0")}`)) number += 1;
    return `BR-${String(number).padStart(2, "0")}`;
  }
}

export const bookingsRepository = new BookingsRepository();
