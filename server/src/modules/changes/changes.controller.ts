import type { RequestHandler } from "express";
import { UnauthorizedError, BadRequestError } from "../../utils/api-error.js";
import ApiResponse from "../../utils/api-response.js";
import AsyncHandler from "../../utils/async-handler.js";
import { validatedData } from "../../middlewares/validate.js";
import type { RequestUser } from "../../types/express.js";
import { changesService, type ChangesService } from "./changes.service.js";
import {
  changeIdParamsSchema,
  changeListQuerySchema,
  changeRejectBodySchema,
  type ChangeRequestBody,
  type Disruption,
  type FacultyUnavailabilityBody,
  type ChangeListQuery,
} from "./changes.schema.js";
import type { z } from "zod";

type Controller = {
  submit: RequestHandler;
  upload: RequestHandler;
  unavailability: RequestHandler;
  request: RequestHandler;
  list: RequestHandler;
  getById: RequestHandler;
  deptApprove: RequestHandler;
  approve: RequestHandler;
  reject: RequestHandler;
  withdraw: RequestHandler;
};

const actorFromRequest = (req: Parameters<RequestHandler>[0]): RequestUser => {
  if (!req.user) throw new UnauthorizedError("Authentication is required.");
  return req.user;
};

export type ChangesControllerService = Pick<
  ChangesService,
  | "submitAdmin"
  | "submitFile"
  | "submitFacultyUnavailability"
  | "submitRequest"
  | "list"
  | "getById"
  | "deptApprove"
  | "approve"
  | "reject"
  | "withdraw"
>;

export const createChangesController = (
  service: ChangesControllerService = changesService,
): Controller => ({
  submit: AsyncHandler(async (req, res) => {
    const body = validatedData<Disruption>(res, "body");
    const result = await service.submitAdmin(actorFromRequest(req), body);
    res.status(202).json(new ApiResponse(202, "Change repair queued.", result));
  }),
  upload: AsyncHandler(async (req, res) => {
    const body = validatedData<Disruption>(res, "body");
    const result = await service.submitFile(actorFromRequest(req), body);
    res
      .status(202)
      .json(new ApiResponse(202, "Change file repair queued.", result));
  }),
  unavailability: AsyncHandler(async (req, res) => {
    const body = validatedData<FacultyUnavailabilityBody>(res, "body");
    const result = await service.submitFacultyUnavailability(
      actorFromRequest(req),
      body,
    );
    res
      .status(202)
      .json(new ApiResponse(202, "Faculty unavailability submitted.", result));
  }),
  request: AsyncHandler(async (req, res) => {
    const body = validatedData<ChangeRequestBody>(res, "body");
    const result = await service.submitRequest(actorFromRequest(req), body);
    res
      .status(202)
      .json(new ApiResponse(202, "Session change request queued.", result));
  }),
  list: AsyncHandler(async (req, res) => {
    const query = validatedData<ChangeListQuery>(res, "query");
    const result = await service.list(actorFromRequest(req), query);
    res
      .status(200)
      .json(new ApiResponse(200, "Change proposals retrieved.", result));
  }),
  getById: AsyncHandler(async (req, res) => {
    const { id } = validatedData<z.infer<typeof changeIdParamsSchema>>(
      res,
      "params",
    );
    const result = await service.getById(id, actorFromRequest(req));
    res
      .status(200)
      .json(new ApiResponse(200, "Change proposal retrieved.", result));
  }),
  deptApprove: AsyncHandler(async (req, res) => {
    const { id } = validatedData<z.infer<typeof changeIdParamsSchema>>(
      res,
      "params",
    );
    const result = await service.deptApprove(id, actorFromRequest(req));
    res
      .status(200)
      .json(new ApiResponse(200, "Department approval recorded.", result));
  }),
  approve: AsyncHandler(async (req, res) => {
    const { id } = validatedData<z.infer<typeof changeIdParamsSchema>>(
      res,
      "params",
    );
    const result = await service.approve(id, actorFromRequest(req));
    res
      .status(200)
      .json(new ApiResponse(200, "Change proposal approved.", result));
  }),
  reject: AsyncHandler(async (req, res) => {
    const { id } = validatedData<z.infer<typeof changeIdParamsSchema>>(
      res,
      "params",
    );
    const { note } = validatedData<z.infer<typeof changeRejectBodySchema>>(
      res,
      "body",
    );
    const result = await service.reject(id, actorFromRequest(req), note);
    res
      .status(200)
      .json(new ApiResponse(200, "Change proposal rejected.", result));
  }),
  withdraw: AsyncHandler(async (req, res) => {
    const { id } = validatedData<z.infer<typeof changeIdParamsSchema>>(
      res,
      "params",
    );
    const result = await service.withdraw(id, actorFromRequest(req));
    res
      .status(200)
      .json(new ApiResponse(200, "Change proposal withdrawn.", result));
  }),
});

export const parseUploadedDisruption: RequestHandler = (req, _res, next) => {
  if (!req.file) {
    next();
    return;
  }
  try {
    req.body = JSON.parse(req.file.buffer.toString("utf8")) as unknown;
    next();
  } catch {
    next(new BadRequestError("The uploaded file must contain valid JSON."));
  }
};
