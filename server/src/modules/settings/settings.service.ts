import { type Role } from "@prisma/client";
import {
  SettingsRepository,
  settingsRepository,
} from "./settings.repository.js";

export class SettingsService {
  constructor(
    private readonly repository: Pick<
      SettingsRepository,
      "getPriorityOrder" | "setPriorityOrder"
    > = settingsRepository,
  ) {}

  getPriorityOrder() {
    return this.repository.getPriorityOrder();
  }

  setPriorityOrder(priorityOrder: string[], actor: { id: string; role: Role }) {
    return this.repository.setPriorityOrder(priorityOrder, actor);
  }
}

export const settingsService = new SettingsService();
