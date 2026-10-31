import { Router, type RequestHandler } from "express";
import ApiResponse from "../../utils/api-response.js";
import AsyncHandler from "../../utils/async-handler.js";
import validate from "../../middlewares/validate.js";
import { validatedData } from "../../middlewares/validate.js";
import { examsService } from "./exams.service.js";
import type { ExamsService } from "./exams.service.js";
import { examGroupParamsSchema } from "./exams.schema.js";
import { z } from "zod";

type GroupParams = z.infer<typeof examGroupParamsSchema>;

export const createPublicExamsRouter = (
  service: Pick<ExamsService, "getPublishedForGroup"> = examsService,
): Router => {
  const publicExamsRouter: Router = Router();
  const getGroupExams: RequestHandler = AsyncHandler(async (_req, res) => {
    const { groupId } = validatedData<GroupParams>(res, "params");
    const exams = await service.getPublishedForGroup(groupId);
    res
      .status(200)
      .json(new ApiResponse(200, "Published group exams retrieved.", exams));
  });

  publicExamsRouter.get(
    "/group/:groupId",
    validate({ params: examGroupParamsSchema }),
    getGroupExams,
  );
  return publicExamsRouter;
};

export default createPublicExamsRouter();
