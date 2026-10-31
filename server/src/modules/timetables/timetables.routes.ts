import { Router, type RequestHandler } from "express";
import { Role } from "@prisma/client";
import requireAuth from "../../middlewares/require-auth.js";
import requireRole from "../../middlewares/require-role.js";
import validate from "../../middlewares/validate.js";
import { createTimetablesController } from "./timetables.controller.js";
import {
  timetablesService,
  type TimetablesService,
} from "./timetables.service.js";
import {
  facultyParamsSchema,
  groupParamsSchema,
  manualValidationBodySchema,
  roomParamsSchema,
  timetableIdParamsSchema,
  timetableListQuerySchema,
} from "./timetables.schema.js";

export const createTimetablesRouter = (
  service: Parameters<typeof createTimetablesController>[0] = timetablesService,
  authenticate: RequestHandler = requireAuth,
): Router => {
  const router = Router();
  const controller = createTimetablesController(service);

  router.post(
    "/generate",
    authenticate,
    requireRole(Role.ADMIN),
    controller.generate,
  );
  router.get(
    "/",
    authenticate,
    requireRole(Role.ADMIN),
    validate({ query: timetableListQuerySchema }),
    controller.list,
  );
  router.get("/published", authenticate, controller.getPublished);
  router.get("/me", authenticate, requireRole(Role.FACULTY), controller.getMe);
  router.get(
    "/views/group/:groupId",
    authenticate,
    validate({ params: groupParamsSchema }),
    controller.groupView,
  );
  router.get(
    "/views/faculty/:facultyId",
    authenticate,
    requireRole(Role.ADMIN, Role.COORDINATOR, Role.FACULTY),
    validate({ params: facultyParamsSchema }),
    controller.facultyView,
  );
  router.get(
    "/views/room/:roomId",
    authenticate,
    validate({ params: roomParamsSchema }),
    controller.roomView,
  );
  router.post(
    "/manual/validate",
    authenticate,
    requireRole(Role.ADMIN, Role.COORDINATOR),
    validate({ body: manualValidationBodySchema }),
    controller.manualValidate,
  );
  router.get(
    "/:id",
    authenticate,
    requireRole(Role.ADMIN),
    validate({ params: timetableIdParamsSchema }),
    controller.getById,
  );
  router.post(
    "/:id/validate",
    authenticate,
    requireRole(Role.ADMIN),
    validate({ params: timetableIdParamsSchema }),
    controller.validateStored,
  );
  router.post(
    "/:id/publish",
    authenticate,
    requireRole(Role.ADMIN),
    validate({ params: timetableIdParamsSchema }),
    controller.publish,
  );
  router.delete(
    "/:id",
    authenticate,
    requireRole(Role.ADMIN),
    validate({ params: timetableIdParamsSchema }),
    controller.deleteDraft,
  );
  return router;
};

export default createTimetablesRouter();
