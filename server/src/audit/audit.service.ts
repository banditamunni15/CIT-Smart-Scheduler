import type { Prisma, Role } from "@prisma/client";

export type AuditInput = {
  actorId: string | null;
  actorRole: Role | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  details?: Prisma.InputJsonValue;
};

export const audit = (
  tx: Prisma.TransactionClient,
  input: AuditInput,
): Promise<unknown> =>
  tx.auditLog.create({
    data: {
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      ...(input.details === undefined ? {} : { details: input.details }),
    },
  });
