import { Router, type RequestHandler } from "express";
import requireAuth from "../../middlewares/require-auth.js";
import requireRole from "../../middlewares/require-role.js";
import validate from "../../middlewares/validate.js";
import { createSettingsController } from "./settings.controller.js";
import { settingsService, type SettingsService } from "./settings.service.js";
import { priorityOrderBodySchema } from "./settings.schema.js";

export const createSettingsRouter = (
  service: Pick<
    SettingsService,
    "getPriorityOrder" | "setPriorityOrder"
  > = settingsService,
  authenticate: RequestHandler = requireAuth,
): Router => {
  const router = Router();
  const controller = createSettingsController(service);

  router.get("/settings/priority-order", controller.getPriorityOrder);
  router.put(
    "/settings/priority-order",
    authenticate,
    requireRole("ADMIN"),
    validate({ body: priorityOrderBodySchema }),
    controller.setPriorityOrder,
  );
  return router;
};

export default createSettingsRouter();
