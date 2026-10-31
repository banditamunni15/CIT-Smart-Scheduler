export type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function displayValue(value: unknown, fallback = "—"): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (value instanceof Date) return value.toLocaleString();
  return fallback;
}

export function formatDate(value: unknown): string {
  if (typeof value !== "string" && !(value instanceof Date)) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "No details provided.";
  } catch {
    return String(value);
  }
}

export function resultHref(resultType: unknown, resultId: unknown): string | null {
  if (typeof resultId !== "string" || !resultId) return null;
  if (resultType === "Timetable") {
    return `/admin/timetables/${encodeURIComponent(resultId)}`;
  }
  if (resultType === "ExamSchedule" || resultType === "Exam") {
    return `/admin/exams/${encodeURIComponent(resultId)}`;
  }
  return null;
}
