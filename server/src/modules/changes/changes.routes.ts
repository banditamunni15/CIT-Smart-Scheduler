import { Router, type RequestHandler } from "express";
import multer from "multer";
import { Role } from "@prisma/client";
import requireAuth from "../../middlewares/require-auth.js";
import requireRole from "../../middlewares/require-role.js";
import validate from "../../middlewares/validate.js";
import { ValidationError } from "../../utils/api-error.js";
import {
  createChangesController,
  parseUploadedDisruption,
  type ChangesControllerService,
} from "./changes.controller.js";
import { changesService } from "./changes.service.js";
import {
  changeIdParamsSchema,
  changeListQuerySchema,
  changeRejectBodySchema,
  changeRequestBodySchema,
  disruptionSchema,
  facultyUnavailabilityBodySchema,
} from "./changes.schema.js";

const multipartUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
}).single("file");

const uploadFile: RequestHandler = (req, res, next) => {
  multipartUpload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(
        new ValidationError(
          error.code === "LIMIT_FILE_SIZE"
            ? "The uploaded disruption file exceeds the 2 MB limit."
            : "The uploaded disruption file is invalid.",
          "UPLOAD_INVALID",
        ),
      );
      return;
    }
    if (error) {
      next(error);
      return;
    }
    parseUploadedDisruption(req, res, next);
  });
};

export const createChangesRouter = (
  service: ChangesControllerService = changesService,
  authenticate: RequestHandler = requireAuth,
): Router => {
  const router = Router();
  const controller = createChangesController(service);
  const signedIn = [authenticate] as const;

  router.post(
    "/",
    ...signedIn,
    requireRole(Role.ADMIN),
    validate({ body: disruptionSchema }),
    controller.submit,
  );
  router.post(
    "/upload",
    ...signedIn,
    requireRole(Role.ADMIN),
    uploadFile,
    validate({ body: disruptionSchema }),
    controller.upload,
  );
  router.post(
    "/unavailability",
    ...signedIn,
    requireRole(Role.FACULTY),
    validate({ body: facultyUnavailabilityBodySchema }),
    controller.unavailability,
  );
  router.post(
    "/request",
    ...signedIn,
    requireRole(Role.COORDINATOR, Role.FACULTY),
    validate({ body: changeRequestBodySchema }),
    controller.request,
  );
  router.get(
    "/",
    ...signedIn,
    validate({ query: changeListQuerySchema }),
    controller.list,
  );
  router.post(
    "/:id/dept-approve",
    ...signedIn,
    requireRole(Role.COORDINATOR),
    validate({ params: changeIdParamsSchema }),
    controller.deptApprove,
  );
  router.post(
    "/:id/approve",
    ...signedIn,
    requireRole(Role.ADMIN),
    validate({ params: changeIdParamsSchema }),
    controller.approve,
  );
  router.post(
    "/:id/reject",
    ...signedIn,
    requireRole(Role.ADMIN),
    validate({
      params: changeIdParamsSchema,
      body: changeRejectBodySchema,
    }),
    controller.reject,
  );
  router.post(
    "/:id/withdraw",
    ...signedIn,
    validate({ params: changeIdParamsSchema }),
    controller.withdraw,
  );
  router.get(
    "/:id",
    ...signedIn,
    validate({ params: changeIdParamsSchema }),
    controller.getById,
  );
  return router;
};

export default createChangesRouter();
