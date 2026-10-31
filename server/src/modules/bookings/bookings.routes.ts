import { Router, type RequestHandler } from "express";
import { Role } from "@prisma/client";
import requireAuth from "../../middlewares/require-auth.js";
import requireRole from "../../middlewares/require-role.js";
import validate from "../../middlewares/validate.js";
import {
  createBookingsController,
  type BookingsControllerService,
} from "./bookings.controller.js";
import { bookingsService } from "./bookings.service.js";
import {
  bookingBodySchema,
  bookingCancelBodySchema,
  bookingIdParamsSchema,
  bookingListQuerySchema,
  bookingManualBodySchema,
  bookingOverrideBodySchema,
  bookingPatchBodySchema,
  bookingReviewBodySchema,
  bookingSeriesParamsSchema,
} from "./bookings.schema.js";

export const createBookingsRouter = (
  service: BookingsControllerService = bookingsService,
  authenticate: RequestHandler = requireAuth,
): Router => {
  const router = Router();
  const controller = createBookingsController(service);
  const allRoles = [Role.ADMIN, Role.COORDINATOR, Role.FACULTY, Role.CLUB];

  router.post(
    "/",
    authenticate,
    requireRole(...allRoles),
    validate({ body: bookingBodySchema }),
    controller.create,
  );
  router.post(
    "/check-draft",
    authenticate,
    requireRole(...allRoles),
    validate({ body: bookingBodySchema }),
    controller.checkDraft,
  );
  router.get(
    "/",
    authenticate,
    requireRole(...allRoles),
    validate({ query: bookingListQuerySchema }),
    controller.list,
  );
  router.get(
    "/series/:seriesId",
    authenticate,
    requireRole(...allRoles),
    validate({ params: bookingSeriesParamsSchema }),
    controller.getSeries,
  );
  router.post(
    "/decide",
    authenticate,
    requireRole(Role.ADMIN),
    controller.decideAll,
  );
  router.post(
    "/manual",
    authenticate,
    requireRole(Role.ADMIN, Role.COORDINATOR),
    validate({ body: bookingManualBodySchema }),
    controller.manual,
  );
  router.post(
    "/:id/decide",
    authenticate,
    requireRole(Role.ADMIN),
    validate({ params: bookingIdParamsSchema }),
    controller.decideOne,
  );
  router.post(
    "/:id/override",
    authenticate,
    requireRole(Role.ADMIN),
    validate({
      params: bookingIdParamsSchema,
      body: bookingOverrideBodySchema,
    }),
    controller.override,
  );
  router.patch(
    "/:id",
    authenticate,
    requireRole(...allRoles),
    validate({ params: bookingIdParamsSchema, body: bookingPatchBodySchema }),
    controller.update,
  );
  router.post(
    "/:id/cancel",
    authenticate,
    requireRole(...allRoles),
    validate({
      params: bookingIdParamsSchema,
      body: bookingCancelBodySchema,
    }),
    controller.cancel,
  );
  router.get(
    "/:id",
    authenticate,
    requireRole(...allRoles),
    validate({ params: bookingIdParamsSchema }),
    controller.getById,
  );
  router.post(
    "/decisions/:id/approve",
    authenticate,
    requireRole(Role.ADMIN),
    validate({ params: bookingIdParamsSchema }),
    controller.approve,
  );
  router.post(
    "/decisions/:id/reject",
    authenticate,
    requireRole(Role.ADMIN),
    validate({
      params: bookingIdParamsSchema,
      body: bookingReviewBodySchema,
    }),
    controller.reject,
  );
  router.post(
    "/decisions/:id/dept-approve",
    authenticate,
    requireRole(Role.COORDINATOR),
    validate({ params: bookingIdParamsSchema }),
    controller.deptApprove,
  );
  return router;
};

export default createBookingsRouter();
