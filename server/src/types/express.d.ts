import type { Role } from "@prisma/client";

export type RequestUser = {
  id: string;
  role: Role;
  department: string | null;
  facultyId: string | null;
  clubName: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

export {};
