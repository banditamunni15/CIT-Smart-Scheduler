import type { RequestHandler } from "express";
import { UnauthorizedError } from "../../utils/api-error.js";
import ApiResponse from "../../utils/api-response.js";
import AsyncHandler from "../../utils/async-handler.js";
import { validatedData } from "../../middlewares/validate.js";
import { examsService, type ExamsService } from "./exams.service.js";
import type { ListExamsQuery, examIdParamsSchema } from "./exams.schema.js";
import { z } from "zod";

type ExamIdParams = z.infer<typeof examIdParamsSchema>;

const getActor = (req: Parameters<RequestHandler>[0]) => {
  if (!req.user) {
    throw new UnauthorizedError("Authentication is required.");
  }
  return { id: req.user.id, role: req.user.role };
};

type ExamsController = {
  generate: RequestHandler;
  list: RequestHandler;
  getById: RequestHandler;
  getPublished: RequestHandler;
  publish: RequestHandler;
};

export const createExamsController = (
  service: Pick<
    ExamsService,
    "generate" | "list" | "getById" | "getPublished" | "publish"
  > = examsService,
): ExamsController => ({
  generate: AsyncHandler(async (req, res) => {
    const result = await service.generate(getActor(req));
    res
      .status(202)
      .json(new ApiResponse(202, "Exam generation started.", result));
  }),
  list: AsyncHandler(async (_req, res) => {
    const query = validatedData<ListExamsQuery>(res, "query");
    const result = await service.list(query);
    res
      .status(200)
      .json(new ApiResponse(200, "Exam schedules retrieved.", result));
  }),
  getById: AsyncHandler(async (_req, res) => {
    const { id } = validatedData<ExamIdParams>(res, "params");
    const result = await service.getById(id);
    res
      .status(200)
      .json(new ApiResponse(200, "Exam schedule retrieved.", result));
  }),
  getPublished: AsyncHandler(async (_req, res) => {
    const result = await service.getPublished();
    res
      .status(200)
      .json(new ApiResponse(200, "Published exam schedule retrieved.", result));
  }),
  publish: AsyncHandler(async (req, res) => {
    const { id } = validatedData<ExamIdParams>(res, "params");
    const result = await service.publish(id, getActor(req));
    res
      .status(200)
      .json(new ApiResponse(200, "Exam schedule published.", result));
  }),
});
