import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import { audit } from "../../audit/audit.service.js";
import { prisma } from "../../lib/prisma.js";

export class SettingsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async getPriorityOrder() {
    const setting = await this.client.appSetting.findUnique({
      where: { key: "priority_order" },
      select: { value: true },
    });
    return Array.isArray(setting?.value) ? setting.value : [];
  }

  async setPriorityOrder(value: string[], actor: { id: string; role: Role }) {
    return this.client.$transaction(async (tx) => {
      const setting = await tx.appSetting.upsert({
        where: { key: "priority_order" },
        create: {
          key: "priority_order",
          value: value as Prisma.InputJsonArray,
          updatedById: actor.id,
        },
        update: {
          value: value as Prisma.InputJsonArray,
          updatedById: actor.id,
        },
        select: { value: true },
      });

      await audit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: "PRIORITY_ORDER_UPDATED",
        entityType: "AppSetting",
        entityId: "priority_order",
        summary: "The scheduling priority order was updated.",
        details: { priority_order: value },
      });

      return setting.value;
    });
  }
}

export const settingsRepository = new SettingsRepository();
