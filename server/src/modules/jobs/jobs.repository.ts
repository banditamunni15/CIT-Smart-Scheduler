import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export class JobsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.client.job.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          kind: true,
          state: true,
          progress: true,
          message: true,
          resultType: true,
          resultId: true,
          error: true,
          createdById: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
        },
      }),
      this.client.job.count(),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: string) {
    return this.client.job.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        state: true,
        progress: true,
        message: true,
        params: true,
        resultType: true,
        resultId: true,
        error: true,
        createdById: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
      },
    });
  }
}
