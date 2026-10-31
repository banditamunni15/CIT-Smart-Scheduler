import type { RequestHandler } from "express";
import { UnauthorizedError } from "../../utils/api-error.js";
import ApiResponse from "../../utils/api-response.js";
import AsyncHandler from "../../utils/async-handler.js";
import { validatedData } from "../../middlewares/validate.js";
import { settingsService, type SettingsService } from "./settings.service.js";
import type { PriorityOrderBody } from "./settings.schema.js";

type SettingsController = {
  getPriorityOrder: RequestHandler;
  setPriorityOrder: RequestHandler;
};

export const createSettingsController = (
  service: Pick<
    SettingsService,
    "getPriorityOrder" | "setPriorityOrder"
  > = settingsService,
): SettingsController => ({
  getPriorityOrder: AsyncHandler(async (_req, res) => {
    const data = await service.getPriorityOrder();
    res
      .status(200)
      .json(new ApiResponse(200, "Priority order retrieved.", data));
  }),
  setPriorityOrder: AsyncHandler(async (req, res) => {
    if (!req.user) {
      throw new UnauthorizedError("Authentication is required.");
    }

    const { priority_order: priorityOrder } = validatedData<PriorityOrderBody>(
      res,
      "body",
    );
    const data = await service.setPriorityOrder(priorityOrder, {
      id: req.user.id,
      role: req.user.role,
    });
    res.status(200).json(new ApiResponse(200, "Priority order updated.", data));
  }),
});
