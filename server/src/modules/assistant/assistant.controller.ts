import type { RequestHandler } from "express";
import type { RequestUser } from "../../types/express.js";
import { UnauthorizedError } from "../../utils/api-error.js";
import ApiResponse from "../../utils/api-response.js";
import AsyncHandler from "../../utils/async-handler.js";
import { validatedData } from "../../middlewares/validate.js";
import type { AssistantService } from "./assistant.service.js";
import type { AssistantChatBody } from "./assistant.schema.js";

export const createAssistantController = (
  service: Pick<AssistantService, "chat">,
): { chat: RequestHandler } => ({
  chat: AsyncHandler(async (req, res) => {
    const user: RequestUser | undefined = req.user;
    if (!user) throw new UnauthorizedError("Authentication is required.");
    const { messages } = validatedData<AssistantChatBody>(res, "body");
    const data = await service.chat(user, messages);
    res
      .status(200)
      .json(new ApiResponse(200, "Assistant response ready.", data));
  }),
});
