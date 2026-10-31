import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { UnauthorizedError } from "../utils/api-error.js";

const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      throw new UnauthorizedError("Authentication is required.");
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        role: true,
        department: true,
        facultyId: true,
        clubName: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError("This account is not active.");
    }

    req.user = {
      id: user.id,
      role: user.role,
      department: user.department,
      facultyId: user.facultyId,
      clubName: user.clubName,
    };
    next();
  } catch (error) {
    next(error);
  }
};

export default requireAuth;
