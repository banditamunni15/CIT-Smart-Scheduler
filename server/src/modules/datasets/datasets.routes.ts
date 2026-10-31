import { Router, type RequestHandler } from "express";
import requireAuth from "../../middlewares/require-auth.js";
import requireRole from "../../middlewares/require-role.js";
import validate from "../../middlewares/validate.js";
import { createDatasetsController } from "./datasets.controller.js";
import { datasetsService, type DatasetsService } from "./datasets.service.js";
import {
  datasetIdParamsSchema,
  datasetListQuerySchema,
  datasetUploadBodySchema,
} from "./datasets.schema.js";

export const createDatasetsRouter = (
  service: Pick<
    DatasetsService,
    "list" | "getActiveSummary" | "upload" | "activate" | "resetDemo"
  > = datasetsService,
  authenticate: RequestHandler = requireAuth,
): Router => {
  const router = Router();
  const controller = createDatasetsController(service);

  router.get(
    "/datasets",
    authenticate,
    requireRole("ADMIN"),
    validate({ query: datasetListQuerySchema }),
    controller.list,
  );
  router.get("/datasets/active", controller.getActive);
  router.post(
    "/datasets/upload",
    authenticate,
    requireRole("ADMIN"),
    validate({ body: datasetUploadBodySchema }),
    controller.upload,
  );
  router.post(
    "/datasets/:id/activate",
    authenticate,
    requireRole("ADMIN"),
    validate({ params: datasetIdParamsSchema }),
    controller.activate,
  );
  router.post(
    "/admin/reset-demo",
    authenticate,
    requireRole("ADMIN"),
    controller.resetDemo,
  );

  return router;
};

export default createDatasetsRouter();
