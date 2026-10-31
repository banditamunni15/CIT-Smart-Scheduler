import type { RequestHandler } from "express";
import { UnauthorizedError } from "../../utils/api-error.js";
import ApiResponse from "../../utils/api-response.js";
import AsyncHandler from "../../utils/async-handler.js";
import { systemService, type SystemService } from "./system.service.js";

export type SystemController = {
  health: RequestHandler;
  me: RequestHandler;
};

export const createSystemController = (
  service: SystemService = systemService,
): SystemController => ({
  health: AsyncHandler(async (_req, res) => {
    const data = service.getHealth();
    res.status(200).json(new ApiResponse(200, "Service is healthy.", data));
  }),
  me: AsyncHandler(async (req, res) => {
    if (!req.user) {
      throw new UnauthorizedError("Authentication is required.");
    }

    const data = service.getCurrentUser(req.user);
    res.status(200).json(new ApiResponse(200, "Current user retrieved.", data));
  }),
});
