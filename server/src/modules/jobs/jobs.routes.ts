import { Router, type RequestHandler } from "express";
import requireAuth from "../../middlewares/require-auth.js";
import requireRole from "../../middlewares/require-role.js";
import validate from "../../middlewares/validate.js";
import { createJobsController } from "./jobs.controller.js";
import { jobsService, type JobsService } from "./jobs.service.js";
import { jobIdParamsSchema, jobsListQuerySchema } from "./jobs.schema.js";

export const createJobsRouter = (
  service: Pick<JobsService, "list" | "getById"> = jobsService,
  authenticate: RequestHandler = requireAuth,
): Router => {
  const router = Router();
  const controller = createJobsController(service);

  router.get(
    "/",
    authenticate,
    requireRole("ADMIN"),
    validate({ query: jobsListQuerySchema }),
    controller.list,
  );
  router.get(
    "/:id",
    authenticate,
    validate({ params: jobIdParamsSchema }),
    controller.getById,
  );
  return router;
};

export default createJobsRouter();
