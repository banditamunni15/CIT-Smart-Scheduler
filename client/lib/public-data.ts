import { normalizeGroups } from "@/lib/timetable-adapter";

export type PublicOption = {
  id: string;
  label: string;
};

export type PublicRoom = {
  id: string;
  type: string;
  capacity: number | null;
};

const recordOf = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};

const pick = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

const valueText = (value: unknown, fallback = ""): string => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  const record = recordOf(value);
  const nested = pick(record, ["room_id", "id", "group_id", "code", "name"]);
  return typeof nested === "string" || typeof nested === "number"
    ? String(nested)
    : fallback;
};

export function normalizePublicGroups(value: unknown): PublicOption[] {
  return normalizeGroups(value).map(({ id, label }) => ({ id, label }));
}

export function normalizePublicRooms(value: unknown): PublicRoom[] {
  if (!Array.isArray(value)) return [];
  const rooms = new Map<string, PublicRoom>();
  for (const raw of value) {
    const record = recordOf(raw);
    const nestedRoom = recordOf(record.room);
    const id = valueText(
      pick(record, ["room_id", "roomId"]) ?? pick(nestedRoom, ["room_id", "id"]),
    );
    if (!id) continue;
    const capacityValue = pick(nestedRoom, ["capacity", "seats"]) ??
      pick(record, ["capacity", "seats"]);
    const capacity = Number(capacityValue);
    rooms.set(id, {
      id,
      type: valueText(
        pick(nestedRoom, ["type", "room_type"]) ??
          pick(record, ["type", "room_type"]),
        "Unspecified",
      ),
      capacity: Number.isFinite(capacity) ? capacity : null,
    });
  }
  return [...rooms.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

export type PublicExam = {
  id: string;
  course: string;
  day: string;
  session: "AM" | "PM";
  rooms: string[];
};

export function normalizePublicExams(value: unknown): PublicExam[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const record = recordOf(raw);
    const courseValue = pick(record, ["course", "course_id", "courseId"]);
    const courseRecord = recordOf(courseValue);
    const course = valueText(
      typeof courseValue === "object"
        ? pick(courseRecord, ["course_id", "id", "code", "name", "title"])
        : courseValue,
      "Course",
    );
    const roomsValue = record.rooms;
    const rooms = Array.isArray(roomsValue)
      ? roomsValue.map((room) => valueText(room)).filter(Boolean)
      : [];
    return {
      id: valueText(pick(record, ["exam_id", "id"]), `exam-${index}`),
      course,
      day: valueText(record.day).toUpperCase(),
      session: record.session === "PM" ? "PM" : "AM",
      rooms,
    };
  });
}

export function publicExamDayOrder(day: string): number {
  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  return days.indexOf(day.slice(0, 3).toUpperCase());
}

export function normalizeFreeRoom(raw: unknown): PublicRoom | null {
  const record = recordOf(raw);
  const id = valueText(pick(record, ["room_id", "roomId", "id"]));
  if (!id) return null;
  const capacityValue = pick(record, ["capacity", "seats"]);
  const capacity = Number(capacityValue);
  return {
    id,
    type: valueText(pick(record, ["type", "room_type"]), "Unspecified"),
    capacity: Number.isFinite(capacity) ? capacity : null,
  };
}
