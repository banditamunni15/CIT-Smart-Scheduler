import { Prisma } from "@prisma/client";
import type {
  DatasetValidationResult,
  EngineClient,
} from "../../lib/engine/index.js";
import { createEngine } from "../../lib/engine/index.js";
import { prisma } from "../../lib/prisma.js";
import { ConflictError, ValidationError } from "../../utils/api-error.js";
import {
  DatasetsRepository,
  type DatasetActor,
} from "./datasets.repository.js";
import type { DatasetListQuery, DatasetUploadBody } from "./datasets.schema.js";

type DatasetRepository = Pick<
  DatasetsRepository,
  "list" | "findActiveSummary" | "upload" | "activate" | "resetDemo"
>;

const summarize = (data: DatasetUploadBody["data"]): Prisma.InputJsonObject => {
  const counts = Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [key, Array.isArray(value) ? value.length : 0]),
  );
  return {
    counts,
    warnings: [],
  };
};

export class DatasetsService {
  constructor(
    private readonly repository: DatasetRepository,
    private readonly engine: Pick<EngineClient, "validate">,
  ) {}

  list(query: DatasetListQuery) {
    return this.repository.list(query);
  }

  async getActiveSummary() {
    const dataset = await this.repository.findActiveSummary();
    if (!dataset) {
      throw new ConflictError(
        "There is no active dataset.",
        "NO_ACTIVE_DATASET",
      );
    }
    return dataset;
  }

  async upload(actor: DatasetActor, input: DatasetUploadBody) {
    const validation: DatasetValidationResult = await this.engine.validate(
      input.data,
    );
    if (validation.report.hard_violation_count > 0) {
      throw new ValidationError(
        "The dataset was rejected by the official validator.",
        "SCHEDULE_RULE_VIOLATION",
        validation.report,
      );
    }

    return this.repository.upload(actor, input, summarize(input.data));
  }

  activate(id: string, actor: DatasetActor) {
    return this.repository.activate(id, actor);
  }

  resetDemo(actor: DatasetActor) {
    return this.repository.resetDemo(actor);
  }
}

export const datasetsService = new DatasetsService(
  new DatasetsRepository(prisma),
  createEngine(),
);
