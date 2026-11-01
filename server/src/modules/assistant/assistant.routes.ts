import { Router, type RequestHandler } from "express";
import requireAuth from "../../middlewares/require-auth.js";
import validate from "../../middlewares/validate.js";
import { createAssistantController } from "./assistant.controller.js";
import {
  assistantService,
  type AssistantService,
} from "./assistant.service.js";
import { assistantChatBodySchema } from "./assistant.schema.js";

export const createAssistantRouter = (
  service: Pick<AssistantService, "chat"> = assistantService,
  authenticate: RequestHandler = requireAuth,
): Router => {
  const router = Router();
  const controller = createAssistantController(service);

  router.post(
    "/chat",
    authenticate,
    validate({ body: assistantChatBodySchema }),
    controller.chat,
  );

  return router;
};

export default createAssistantRouter();
