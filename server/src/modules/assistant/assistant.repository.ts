import { PublishStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { RequestUser } from "../../types/express.js";
import type { AssistantChatBody } from "./assistant.schema.js";

type JsonRecord = { [key: string]: Prisma.JsonValue };

const isJsonRecord = (value: Prisma.JsonValue): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const queryTerms = (messages: AssistantChatBody["messages"]): string[] => {
  const latestQuestion = messages.at(-1)?.content.toLowerCase() ?? "";
  return [
    ...new Set(
      latestQuestion
        .match(/[\p{L}\p{N}-]{3,}/gu)
        ?.filter(
          (term) =>
            ![
              "the",
              "and",
              "for",
              "from",
              "with",
              "what",
              "when",
              "where",
              "which",
              "who",
              "how",
              "are",
              "does",
              "can",
              "show",
              "tell",
              "about",
            ].includes(term),
        ) ?? [],
    ),
  ];
};

const selectRecords = (
  data: Prisma.JsonValue,
  field: string,
  terms: string[],
  limit = 20,
): Prisma.JsonValue[] => {
  if (!isJsonRecord(data)) return [];
  const value = data[field];
  if (!Array.isArray(value)) return [];

  const records = value.filter(isJsonRecord);
  if (terms.length === 0) return records.slice(0, 10);

  const ranked = records
    .map((record) => {
      const text = JSON.stringify(record).toLowerCase();
      return {
        record,
        score: terms.reduce(
          (score, term) => score + (text.includes(term) ? 1 : 0),
          0,
        ),
      };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ record }) => record);

  return ranked.length > 0 ? ranked : records.slice(0, 5);
};

const pickRecordFields = (
  records: Prisma.JsonValue[],
  fields: string[],
): Prisma.JsonValue[] =>
  records.map((record) => {
    if (!isJsonRecord(record)) return record;
    return Object.fromEntries(
      fields.flatMap((field) =>
        record[field] === undefined ? [] : [[field, record[field]]],
      ),
    ) as Prisma.JsonObject;
  });

const datasetContext = (
  data: Prisma.JsonValue,
  terms: string[],
  schedule: Prisma.JsonValue | null,
): Prisma.JsonObject => {
  if (!isJsonRecord(data)) return {};

  const courses = selectRecords(data, "courses", terms);
  const faculty = selectRecords(data, "faculty", terms);
  const groups = selectRecords(data, "student_groups", terms);
  const relevantCourseIds = new Set(
    courses.flatMap((record) =>
      isJsonRecord(record) && typeof record.id === "string" ? [record.id] : [],
    ),
  );
  const relevantFacultyIds = new Set(
    faculty.flatMap((record) =>
      isJsonRecord(record) && typeof record.id === "string" ? [record.id] : [],
    ),
  );
  const relevantGroupIds = new Set(
    groups.flatMap((record) =>
      isJsonRecord(record) && typeof record.id === "string" ? [record.id] : [],
    ),
  );
  const sessions = selectRecords(data, "sessions", terms, 40);
  const allSessions =
    isJsonRecord(data) && Array.isArray(data.sessions)
      ? data.sessions.filter(isJsonRecord)
      : [];
  const linkedSessions = allSessions.filter((session) => {
    const linkedCourse =
      typeof session.course_id === "string" &&
      relevantCourseIds.has(session.course_id);
    const linkedFaculty =
      typeof session.faculty_id === "string" &&
      relevantFacultyIds.has(session.faculty_id);
    const linkedGroupIds = Array.isArray(session.groups)
      ? session.groups.filter(
          (group): group is string => typeof group === "string",
        )
      : [];
    const linkedGroup = linkedGroupIds.some((id) => relevantGroupIds.has(id));
    return linkedCourse || linkedFaculty || linkedGroup;
  });
  const dayAliases: Record<string, string> = {
    monday: "MON",
    mon: "MON",
    tuesday: "TUE",
    tue: "TUE",
    wednesday: "WED",
    wed: "WED",
    thursday: "THU",
    thu: "THU",
    friday: "FRI",
    fri: "FRI",
  };
  const requestedDay = terms
    .map((term) => dayAliases[term])
    .find((day) => day !== undefined);
  const scheduledSessionIds = new Set(
    schedule && isJsonRecord(schedule) && Array.isArray(schedule.sessions)
      ? schedule.sessions.flatMap((entry) => {
          if (
            !isJsonRecord(entry) ||
            typeof entry.session_id !== "string" ||
            (requestedDay && entry.day !== requestedDay)
          ) {
            return [];
          }
          return [entry.session_id];
        })
      : [],
  );
  const scheduledSessions = allSessions.filter(
    (session) =>
      typeof session.id === "string" && scheduledSessionIds.has(session.id),
  );
  const selectedSessions = [
    ...new Map(
      [...sessions, ...linkedSessions, ...scheduledSessions].map((session) => [
        isJsonRecord(session) && typeof session.id === "string"
          ? session.id
          : JSON.stringify(session),
        session,
      ]),
    ).values(),
  ].slice(0, 40);

  const fields: Record<string, string[]> = {
    rooms: ["id", "name", "building", "type", "capacity", "features"],
    faculty: ["id", "name", "department"],
    student_groups: ["id", "name", "year", "department", "size"],
    courses: ["id", "title", "department", "year"],
  };

  return {
    institute: data.institute ?? null,
    calendar: data.calendar ?? null,
    ...Object.fromEntries(
      Object.entries(fields).map(([field, selectedFields]) => [
        field,
        pickRecordFields(
          field === "courses"
            ? courses
            : field === "faculty"
              ? faculty
              : selectRecords(data, field, terms),
          selectedFields,
        ),
      ]),
    ),
    sessions: pickRecordFields(selectedSessions, [
      "id",
      "course_id",
      "kind",
      "groups",
      "faculty_id",
      "duration",
      "room_types",
      "fixed_slot",
    ]),
  };
};

const scheduleEntries = (schedule: Prisma.JsonValue): Prisma.JsonValue[] => {
  if (!isJsonRecord(schedule) || !Array.isArray(schedule.sessions)) return [];
  return schedule.sessions.flatMap((entry) => {
    if (!isJsonRecord(entry)) return [];
    const fields = ["session_id", "day", "start_period", "room_id"];
    return [
      Object.fromEntries(
        fields.flatMap((field) =>
          entry[field] === undefined ? [] : [[field, entry[field]]],
        ),
      ) as Prisma.JsonObject,
    ];
  });
};

const examEntries = (exams: Prisma.JsonValue): Prisma.JsonValue[] => {
  if (!Array.isArray(exams)) return [];
  return exams.flatMap((exam) => {
    if (!isJsonRecord(exam)) return [];
    const fields = [
      "exam_id",
      "course",
      "course_id",
      "course_ids",
      "groups",
      "group_ids",
      "day",
      "session",
      "rooms",
    ];
    return [
      Object.fromEntries(
        fields.flatMap((field) =>
          exam[field] === undefined ? [] : [[field, exam[field]]],
        ),
      ) as Prisma.JsonObject,
    ];
  });
};

export type AssistantContext = {
  generatedAt: string;
  userRole: string;
  activeDataset: {
    id: string;
    label: string;
    version: number;
  } | null;
  datasetReference: Prisma.JsonObject | null;
  publishedTimetable: {
    id: string;
    label: string | null;
    publishedAt: string | null;
    sessions: Prisma.JsonValue[];
  } | null;
  publishedExams: {
    id: string;
    publishedAt: string | null;
    exams: Prisma.JsonValue[];
  } | null;
  myBookings: unknown[];
  myChangeRequests: unknown[];
  myRecentJobs: unknown[];
};

export class AssistantRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async getContext(
    user: RequestUser,
    messages: AssistantChatBody["messages"],
  ): Promise<AssistantContext> {
    const terms = queryTerms(messages);
    const [activeDataset, timetable, exams, bookings, changes, jobs] =
      await Promise.all([
        this.client.dataset.findFirst({
          where: { isActive: true },
          select: { id: true, label: true, version: true, data: true },
        }),
        this.client.timetable.findFirst({
          where: {
            status: PublishStatus.PUBLISHED,
            dataset: { isActive: true },
          },
          orderBy: { publishedAt: "desc" },
          select: {
            id: true,
            label: true,
            publishedAt: true,
            schedule: true,
          },
        }),
        this.client.examSchedule.findFirst({
          where: {
            status: PublishStatus.PUBLISHED,
            dataset: { isActive: true },
          },
          orderBy: { publishedAt: "desc" },
          select: { id: true, publishedAt: true, exams: true },
        }),
        this.client.bookingRequest.findMany({
          where: { requesterId: user.id },
          orderBy: { submittedAt: "desc" },
          take: 8,
          select: {
            title: true,
            status: true,
            requestedCategory: true,
            submittedAt: true,
            decisions: {
              where: { isCurrent: true },
              select: {
                status: true,
                day: true,
                startPeriod: true,
                endPeriod: true,
                roomId: true,
                reason: true,
                approvalState: true,
              },
            },
          },
        }),
        this.client.changeProposal.findMany({
          where: { requestedById: user.id },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: {
            source: true,
            status: true,
            createdAt: true,
            movedCount: true,
            timeChangedCount: true,
            roomOnlyCount: true,
          },
        }),
        this.client.job.findMany({
          where: { createdById: user.id },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            kind: true,
            state: true,
            progress: true,
            message: true,
            createdAt: true,
            finishedAt: true,
          },
        }),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      userRole: user.role,
      activeDataset: activeDataset
        ? {
            id: activeDataset.id,
            label: activeDataset.label,
            version: activeDataset.version,
          }
        : null,
      datasetReference: activeDataset
        ? datasetContext(activeDataset.data, terms, timetable?.schedule ?? null)
        : null,
      publishedTimetable: timetable
        ? {
            id: timetable.id,
            label: timetable.label,
            publishedAt: timetable.publishedAt?.toISOString() ?? null,
            sessions: scheduleEntries(timetable.schedule),
          }
        : null,
      publishedExams: exams
        ? {
            id: exams.id,
            publishedAt: exams.publishedAt?.toISOString() ?? null,
            exams: examEntries(exams.exams),
          }
        : null,
      myBookings: bookings.map((booking) => ({
        ...booking,
        submittedAt: booking.submittedAt.toISOString(),
      })),
      myChangeRequests: changes.map((change) => ({
        ...change,
        createdAt: change.createdAt.toISOString(),
      })),
      myRecentJobs: jobs.map((job) => ({
        ...job,
        createdAt: job.createdAt.toISOString(),
        finishedAt: job.finishedAt?.toISOString() ?? null,
      })),
    };
  }
}
