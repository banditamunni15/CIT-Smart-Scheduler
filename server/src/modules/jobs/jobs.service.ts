import { Role } from "@prisma/client";
import { NotFoundError } from "../../utils/api-error.js";
import { JobsRepository } from "./jobs.repository.js";
import type { JobsListQuery } from "./jobs.schema.js";

export class JobsService {
  constructor(
    private readonly repository: Pick<
      JobsRepository,
      "list" | "findById"
    > = new JobsRepository(),
  ) {}

  list(query: JobsListQuery) {
    return this.repository.list(query.page, query.limit);
  }

  async getById(id: string, actor: { id: string; role: Role }) {
    const job = await this.repository.findById(id);
    if (!job || (actor.role !== Role.ADMIN && job.createdById !== actor.id)) {
      throw new NotFoundError("The job was not found.");
    }
    return job;
  }
}

export const jobsService = new JobsService();
