import { Prisma } from "@prisma/client";
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

const validateDatasetStructure = (data: DatasetUploadBody["data"]): void => {
  const requiredArrays = [
    "rooms", "room_unavailability", "faculty", "courses", "sessions",
    "booking_requests", "cancellations", "exams", "priority_order",
  ];
  const missing = requiredArrays.filter((key) => !Array.isArray(data[key]));
  if (!Array.isArray(data.student_groups) && !Array.isArray(data.groups)) {
    missing.push("student_groups");
  }
  if (missing.length) {
    throw new ValidationError(
      "The uploaded dataset is missing required collections.",
      "DATASET_INVALID",
      { missing },
    );
  }
  if (typeof data.calendar !== "object" || data.calendar === null || Array.isArray(data.calendar)) {
    throw new ValidationError("The uploaded dataset must contain a calendar object.", "DATASET_INVALID");
  }
  const calendar = data.calendar as Record<string, unknown>;
  if (!Array.isArray(calendar.days) || calendar.days.length === 0) {
    throw new ValidationError("The dataset calendar must define at least one day.", "DATASET_INVALID");
  }
  if (typeof data.role_category_cap !== "object" || data.role_category_cap === null || Array.isArray(data.role_category_cap)) {
    throw new ValidationError("The dataset must define role_category_cap.", "DATASET_INVALID");
  }
  for (const key of [...requiredArrays, ...(Array.isArray(data.student_groups) ? ["student_groups"] : [])]) {
    const value = data[key];
    const valid = Array.isArray(value) && value.every((item) =>
      key === "priority_order"
        ? typeof item === "string"
        : typeof item === "object" && item !== null && !Array.isArray(item),
    );
    if (!valid) {
      throw new ValidationError(`Dataset collection "${key}" contains an invalid entry.`, "DATASET_INVALID");
    }
  }
  const caps = data.role_category_cap as Record<string, unknown>;
  const categories = ["institute_event", "guest_lecture", "department_event", "club_event"];
  for (const role of ["admin", "faculty", "department_coordinator", "club"]) {
    if (typeof caps[role] !== "string" || !categories.includes(caps[role] as string)) {
      throw new ValidationError(`role_category_cap.${role} is missing or invalid.`, "DATASET_INVALID");
    }
  }
  const priority = data.priority_order as string[];
  if (categories.some((category) => !priority.includes(category)) ||
      new Set(priority.filter((category) => categories.includes(category))).size !== 4) {
    throw new ValidationError("priority_order must include each booking category exactly once.", "DATASET_INVALID");
  }
  const idFields: Record<string, string[]> = {
    rooms: ["id", "room_id"], faculty: ["id", "faculty_id"],
    student_groups: ["id", "group_id"], groups: ["id", "group_id"],
    courses: ["id", "course_id"], sessions: ["id", "session_id"],
    booking_requests: ["id", "request_id"], exams: ["id", "exam_id"],
  };
  for (const [collection, fields] of Object.entries(idFields)) {
    const rows = collection === "student_groups" && !Array.isArray(data.student_groups)
      ? data.groups
      : data[collection];
    if (!Array.isArray(rows)) continue;
    const ids = rows.map((row) => {
      if (typeof row !== "object" || row === null || Array.isArray(row)) return undefined;
      const record = row as Record<string, unknown>;
      const key = fields.find((field) => typeof record[field] === "string");
      return key ? record[key] as string : undefined;
    });
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
      throw new ValidationError(`Dataset collection "${collection}" must have unique non-empty identifiers.`, "DATASET_INVALID");
    }
  }
};

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
    // Kept as an optional second argument for existing test/integration wiring.
    _engine?: unknown,
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
    // /validate validates a schedule, not a dataset by itself. Do not send a
    // dataset-only payload to that endpoint (it requires { dataset, schedule }).
    // Validate the dataset envelope locally; timetable generation will then be
    // checked by the official validator before a timetable can be persisted.
    validateDatasetStructure(input.data);
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
);
