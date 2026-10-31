import { Router } from "express";
import type { RequestHandler } from "express";
import requireAuth from "../../middlewares/require-auth.js";
import requireRole from "../../middlewares/require-role.js";
import validate from "../../middlewares/validate.js";
import { createExamsController } from "./exams.controller.js";
import { examsService, type ExamsService } from "./exams.service.js";
import { examIdParamsSchema, listExamsQuerySchema } from "./exams.schema.js";

export const createExamsRouter = (
  service: Pick<
    ExamsService,
    "generate" | "list" | "getById" | "getPublished" | "publish"
  > = examsService,
  authenticate: RequestHandler = requireAuth,
): Router => {
  const examsRouter = Router();
  const controller = createExamsController(service);

  examsRouter.post(
    "/generate",
    authenticate,
    requireRole("ADMIN"),
    controller.generate,
  );
  examsRouter.get(
    "/",
    authenticate,
    requireRole("ADMIN"),
    validate({ query: listExamsQuerySchema }),
    controller.list,
  );
  examsRouter.get("/published", authenticate, controller.getPublished);
  examsRouter.get(
    "/:id",
    authenticate,
    requireRole("ADMIN"),
    validate({ params: examIdParamsSchema }),
    controller.getById,
  );
  examsRouter.post(
    "/:id/publish",
    authenticate,
    requireRole("ADMIN"),
    validate({ params: examIdParamsSchema }),
    controller.publish,
  );
  return examsRouter;
};

export default createExamsRouter();
