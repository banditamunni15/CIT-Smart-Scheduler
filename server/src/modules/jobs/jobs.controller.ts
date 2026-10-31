import type { RequestHandler } from "express";
import { UnauthorizedError } from "../../utils/api-error.js";
import ApiResponse from "../../utils/api-response.js";
import AsyncHandler from "../../utils/async-handler.js";
import { validatedData } from "../../middlewares/validate.js";
import { jobsService, type JobsService } from "./jobs.service.js";
import type { JobsListQuery } from "./jobs.schema.js";
import { jobIdParamsSchema } from "./jobs.schema.js";
import type { z } from "zod";

type JobIdParams = z.infer<typeof jobIdParamsSchema>;

const getActor = (req: Parameters<RequestHandler>[0]) => {
  if (!req.user) {
    throw new UnauthorizedError("Authentication is required.");
  }
  return { id: req.user.id, role: req.user.role };
};

type JobsController = { list: RequestHandler; getById: RequestHandler };

export const createJobsController = (
  service: Pick<JobsService, "list" | "getById"> = jobsService,
): JobsController => ({
  list: AsyncHandler(async (_req, res) => {
    const query = validatedData<JobsListQuery>(res, "query");
    const data = await service.list(query);
    res.status(200).json(new ApiResponse(200, "Jobs retrieved.", data));
  }),
  getById: AsyncHandler(async (req, res) => {
    const { id } = validatedData<JobIdParams>(res, "params");
    const data = await service.getById(id, getActor(req));
    res.status(200).json(new ApiResponse(200, "Job retrieved.", data));
  }),
});
