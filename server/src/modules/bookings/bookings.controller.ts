import type { RequestHandler } from "express";
import { UnauthorizedError } from "../../utils/api-error.js";
import ApiResponse from "../../utils/api-response.js";
import AsyncHandler from "../../utils/async-handler.js";
import { validatedData } from "../../middlewares/validate.js";
import type { RequestUser } from "../../types/express.js";
import { bookingsService, type BookingsService } from "./bookings.service.js";
import {
  bookingBodySchema,
  bookingCancelBodySchema,
  bookingDecisionBodySchema,
  bookingIdParamsSchema,
  bookingListQuerySchema,
  bookingManualBodySchema,
  bookingOverrideBodySchema,
  bookingPatchBodySchema,
  bookingReviewBodySchema,
  bookingSeriesParamsSchema,
} from "./bookings.schema.js";
import type { z } from "zod";

type IdParams = z.infer<typeof bookingIdParamsSchema>;
type SeriesParams = z.infer<typeof bookingSeriesParamsSchema>;

const actorFromRequest = (req: Parameters<RequestHandler>[0]): RequestUser => {
  if (!req.user) throw new UnauthorizedError("Authentication is required.");
  return req.user;
};

type Controller = {
  create: RequestHandler;
  checkDraft: RequestHandler;
  list: RequestHandler;
  getSeries: RequestHandler;
  getById: RequestHandler;
  update: RequestHandler;
  cancel: RequestHandler;
  decideAll: RequestHandler;
  decideOne: RequestHandler;
  override: RequestHandler;
  approve: RequestHandler;
  reject: RequestHandler;
  deptApprove: RequestHandler;
  manual: RequestHandler;
};

export type BookingsControllerService = Pick<
  BookingsService,
  | "create"
  | "checkDraft"
  | "list"
  | "getSeries"
  | "getById"
  | "update"
  | "cancel"
  | "queueDecisions"
  | "override"
  | "approveDecision"
  | "rejectDecision"
  | "deptApprove"
  | "manual"
>;

export const createBookingsController = (
  service: BookingsControllerService = bookingsService,
): Controller => ({
  create: AsyncHandler(async (req, res) => {
    const body = validatedData<z.infer<typeof bookingBodySchema>>(res, "body");
    const data = await service.create(actorFromRequest(req), body);
    res
      .status(201)
      .json(new ApiResponse(201, "Booking request submitted.", data));
  }),
  checkDraft: AsyncHandler(async (req, res) => {
    const body = validatedData<z.infer<typeof bookingBodySchema>>(res, "body");
    const data = await service.checkDraft(actorFromRequest(req), body);
    res.status(200).json(new ApiResponse(200, "Booking draft checked.", data));
  }),
  list: AsyncHandler(async (req, res) => {
    const query = validatedData<z.infer<typeof bookingListQuerySchema>>(
      res,
      "query",
    );
    const data = await service.list(actorFromRequest(req), query);
    res
      .status(200)
      .json(new ApiResponse(200, "Booking requests retrieved.", data));
  }),
  getSeries: AsyncHandler(async (req, res) => {
    const { seriesId } = validatedData<SeriesParams>(res, "params");
    const data = await service.getSeries(seriesId, actorFromRequest(req));
    res
      .status(200)
      .json(new ApiResponse(200, "Booking series retrieved.", data));
  }),
  getById: AsyncHandler(async (req, res) => {
    const { id } = validatedData<IdParams>(res, "params");
    const data = await service.getById(id, actorFromRequest(req));
    res
      .status(200)
      .json(new ApiResponse(200, "Booking request retrieved.", data));
  }),
  update: AsyncHandler(async (req, res) => {
    const { id } = validatedData<IdParams>(res, "params");
    const body = validatedData<z.infer<typeof bookingPatchBodySchema>>(
      res,
      "body",
    );
    const data = await service.update(id, actorFromRequest(req), body);
    res
      .status(200)
      .json(new ApiResponse(200, "Booking request updated.", data));
  }),
  cancel: AsyncHandler(async (req, res) => {
    const { id } = validatedData<IdParams>(res, "params");
    const { note } = validatedData<z.infer<typeof bookingCancelBodySchema>>(
      res,
      "body",
    );
    const data = await service.cancel(id, actorFromRequest(req), note);
    res
      .status(200)
      .json(new ApiResponse(200, "Booking request cancelled.", data));
  }),
  decideAll: AsyncHandler(async (req, res) => {
    const data = await service.queueDecisions(actorFromRequest(req));
    res
      .status(202)
      .json(new ApiResponse(202, "Booking decisions queued.", data));
  }),
  decideOne: AsyncHandler(async (req, res) => {
    const { id } = validatedData<IdParams>(res, "params");
    const data = await service.queueDecisions(actorFromRequest(req), id);
    res
      .status(202)
      .json(new ApiResponse(202, "Booking decision queued.", data));
  }),
  override: AsyncHandler(async (req, res) => {
    const { id } = validatedData<IdParams>(res, "params");
    const body = validatedData<z.infer<typeof bookingOverrideBodySchema>>(
      res,
      "body",
    );
    const data = await service.override(id, actorFromRequest(req), body);
    res
      .status(200)
      .json(new ApiResponse(200, "Booking decision overridden.", data));
  }),
  approve: AsyncHandler(async (req, res) => {
    const { id } = validatedData<IdParams>(res, "params");
    const data = await service.approveDecision(id, actorFromRequest(req));
    res
      .status(200)
      .json(new ApiResponse(200, "Booking decision approved.", data));
  }),
  reject: AsyncHandler(async (req, res) => {
    const { id } = validatedData<IdParams>(res, "params");
    const { reason } = validatedData<z.infer<typeof bookingReviewBodySchema>>(
      res,
      "body",
    );
    const data = await service.rejectDecision(
      id,
      actorFromRequest(req),
      reason,
    );
    res
      .status(200)
      .json(new ApiResponse(200, "Booking decision rejected.", data));
  }),
  deptApprove: AsyncHandler(async (req, res) => {
    const { id } = validatedData<IdParams>(res, "params");
    const data = await service.deptApprove(id, actorFromRequest(req));
    res
      .status(200)
      .json(new ApiResponse(200, "Department approval recorded.", data));
  }),
  manual: AsyncHandler(async (req, res) => {
    const body = validatedData<z.infer<typeof bookingManualBodySchema>>(
      res,
      "body",
    );
    const data = await service.manual(actorFromRequest(req), body);
    res.status(201).json(new ApiResponse(201, "Manual booking created.", data));
  }),
});
