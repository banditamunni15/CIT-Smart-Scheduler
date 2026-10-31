import type { RequestUser } from "../../types/express.js";

export class SystemService {
  getHealth() {
    return { status: "ok" as const };
  }

  getCurrentUser(user: RequestUser) {
    return user;
  }
}

export const systemService = new SystemService();
