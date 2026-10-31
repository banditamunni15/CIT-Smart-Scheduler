export type TimetableDetail = {
  label: string;
  value: string;
};

export type TimetableEntry = {
  id: string;
  day: string;
  startPeriod: number;
  duration: number;
  courseId: string;
  courseTitle: string;
  roomId: string;
  kind: string;
  groups: string[];
  faculty: string[];
  details: TimetableDetail[];
};

type RawRecord = Record<string, unknown>;

const recordOf = (raw: unknown): RawRecord =>
  raw !== null && typeof raw === "object" ? (raw as RawRecord) : {};

const firstValue = (record: RawRecord, fields: string[]) => {
  for (const field of fields) {
    const value = record[field];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;

const stringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string" || typeof item === "number") return String(item);
    const record = recordOf(item);
    return text(firstValue(record, ["id", "code", "name", "faculty_id", "group_id"]));
  }).filter(Boolean);
};

export function normalizeEntry(raw: unknown): TimetableEntry {
  const record = recordOf(raw);
  const course = recordOf(firstValue(record, ["course", "subject"]));
  const groupValue = firstValue(record, ["groups", "group_ids", "group"]);
  const facultyValue = firstValue(record, ["faculty", "faculty_ids", "instructors"]);
  const dayValue = text(firstValue(record, ["day", "day_of_week"])).toUpperCase();
  const day = dayValue.slice(0, 3);
  const startPeriod = Number(firstValue(record, ["startPeriod", "start_period", "period"]));
  const duration = Number(firstValue(record, ["duration", "duration_periods", "periods_count"]) ?? 1);
  const courseId = text(
    firstValue(record, ["courseId", "course_id", "subject_id"]) ??
      firstValue(course, ["id", "course_id", "code"]),
    "Course",
  );
  const courseTitle = text(
    firstValue(record, ["courseTitle", "course_title", "subject_name", "title"]) ??
      firstValue(course, ["title", "name"]),
    courseId,
  );
  const details: TimetableDetail[] = [
    { label: "Course", value: courseTitle },
    { label: "Course ID", value: courseId },
    { label: "Day", value: day },
    { label: "Start period", value: text(startPeriod) },
    { label: "Duration", value: `${duration} period${duration === 1 ? "" : "s"}` },
    { label: "Room", value: text(firstValue(record, ["roomId", "room_id", "room"]), "Not assigned") },
    { label: "Groups", value: stringList(Array.isArray(groupValue) ? groupValue : [groupValue]).join(", ") || "—" },
    { label: "Faculty", value: stringList(Array.isArray(facultyValue) ? facultyValue : [facultyValue]).join(", ") || "—" },
  ];

  return {
    id: text(
      firstValue(record, ["id", "session_id"]),
      `${courseId}-${day}-${startPeriod}-${text(firstValue(record, ["roomId", "room_id", "room"]), "TBA")}`,
    ),
    day,
    startPeriod,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 1,
    courseId,
    courseTitle,
    roomId: text(firstValue(record, ["roomId", "room_id", "room"]), "TBA"),
    kind: text(firstValue(record, ["kind", "type", "session_type"]), "T"),
    groups: stringList(Array.isArray(groupValue) ? groupValue : [groupValue]),
    faculty: stringList(Array.isArray(facultyValue) ? facultyValue : [facultyValue]),
    details,
  };
}

export function normalizeGroups(raw: unknown): Array<{ id: string; label: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const record = recordOf(item);
    const id = text(firstValue(record, ["id", "group_id", "code"]), `group-${index + 1}`);
    return {
      id,
      label: text(firstValue(record, ["name", "label", "title"]), id),
    };
  });
}
