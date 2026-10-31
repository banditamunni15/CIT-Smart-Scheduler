import type { RequestHandler } from "express";
import type { Role } from "@prisma/client";
import { ForbiddenError, UnauthorizedError } from "../utils/api-error.js";

const requireRole =
  (...allowedRoles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError("Authentication is required."));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError("You do not have permission to do this."));
      return;
    }

    next();
  };

export default requireRole;
