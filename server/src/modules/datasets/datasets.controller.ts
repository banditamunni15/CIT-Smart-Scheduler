import type { RequestHandler } from "express";
import { UnauthorizedError } from "../../utils/api-error.js";
import ApiResponse from "../../utils/api-response.js";
import AsyncHandler from "../../utils/async-handler.js";
import { validatedData } from "../../middlewares/validate.js";
import { datasetsService, type DatasetsService } from "./datasets.service.js";
import type { DatasetListQuery, DatasetUploadBody } from "./datasets.schema.js";
import type { z } from "zod";
import { datasetIdParamsSchema } from "./datasets.schema.js";

type DatasetIdParams = z.infer<typeof datasetIdParamsSchema>;

const getActor = (req: Parameters<RequestHandler>[0]) => {
  if (!req.user) {
    throw new UnauthorizedError("Authentication is required.");
  }
  return { id: req.user.id, role: req.user.role };
};

type DatasetsController = {
  list: RequestHandler;
  getActive: RequestHandler;
  upload: RequestHandler;
  activate: RequestHandler;
  resetDemo: RequestHandler;
};

export const createDatasetsController = (
  service: Pick<
    DatasetsService,
    "list" | "getActiveSummary" | "upload" | "activate" | "resetDemo"
  > = datasetsService,
): DatasetsController => ({
  list: AsyncHandler(async (_req, res) => {
    const query = validatedData<DatasetListQuery>(res, "query");
    const data = await service.list(query);
    res.status(200).json(new ApiResponse(200, "Datasets retrieved.", data));
  }),
  getActive: AsyncHandler(async (_req, res) => {
    const data = await service.getActiveSummary();
    res
      .status(200)
      .json(new ApiResponse(200, "Active dataset retrieved.", data));
  }),
  upload: AsyncHandler(async (req, res) => {
    const input = validatedData<DatasetUploadBody>(res, "body");
    const data = await service.upload(getActor(req), input);
    res.status(201).json(new ApiResponse(201, "Dataset uploaded.", data));
  }),
  activate: AsyncHandler(async (req, res) => {
    const { id } = validatedData<DatasetIdParams>(res, "params");
    const data = await service.activate(id, getActor(req));
    res.status(200).json(new ApiResponse(200, "Dataset activated.", data));
  }),
  resetDemo: AsyncHandler(async (req, res) => {
    const data = await service.resetDemo(getActor(req));
    res.status(200).json(new ApiResponse(200, "Demo reset.", data));
  }),
});
