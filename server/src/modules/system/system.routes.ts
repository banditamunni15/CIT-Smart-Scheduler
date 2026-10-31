import { Router, type RequestHandler } from "express";
import requireAuth from "../../middlewares/require-auth.js";
import { createSystemController } from "./system.controller.js";
import { systemService, type SystemService } from "./system.service.js";

export const createSystemRouter = (
  service: SystemService = systemService,
  authenticate: RequestHandler = requireAuth,
): Router => {
  const router = Router();
  const controller = createSystemController(service);

  router.get("/health", controller.health);
  router.get("/me", authenticate, controller.me);

  return router;
};

export default createSystemRouter();
