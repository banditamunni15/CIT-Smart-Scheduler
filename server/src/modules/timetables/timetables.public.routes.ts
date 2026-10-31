import { Router } from "express";
import validate from "../../middlewares/validate.js";
import { createTimetablesController } from "./timetables.controller.js";
import { timetablesService } from "./timetables.service.js";
import {
  freeRoomsQuerySchema,
  groupParamsSchema,
  roomParamsSchema,
} from "./timetables.schema.js";

export const createPublicTimetablesRouter = (
  service: Parameters<typeof createTimetablesController>[0] = timetablesService,
): Router => {
  const router = Router();
  const controller = createTimetablesController(service);

  router.get("/groups", controller.publicGroups);
  router.get(
    "/timetable/group/:groupId",
    validate({ params: groupParamsSchema }),
    controller.publicGroupView,
  );
  router.get(
    "/timetable/room/:roomId",
    validate({ params: roomParamsSchema }),
    controller.publicRoomView,
  );
  router.get(
    "/free-rooms",
    validate({ query: freeRoomsQuerySchema }),
    controller.freeRooms,
  );
  return router;
};

export default createPublicTimetablesRouter();
