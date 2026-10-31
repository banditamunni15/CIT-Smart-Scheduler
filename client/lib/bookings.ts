import { asArray, asRecord } from "@/lib/admin-data";

export type BookingWindow = {
  day: string;
  from_period: number;
  to_period: number;
};

export function bookingWindows(value: unknown): BookingWindow[] {
  return asArray(value).flatMap((raw) => {
    const window = asRecord(raw);
    if (
      typeof window.day !== "string" ||
      typeof window.from_period !== "number" ||
      typeof window.to_period !== "number"
    ) {
      return [];
    }
    return [{
      day: window.day,
      from_period: window.from_period,
      to_period: window.to_period,
    }];
  });
}

export function windowSummary(value: unknown): string {
  const windows = bookingWindows(value);
  if (!windows.length) return "No requested windows";
  return windows
    .map((window) => `${window.day} P${window.from_period}–P${window.to_period}`)
    .join(", ");
}

export function categoryLabel(category: unknown): string {
  if (typeof category !== "string") return "—";
  const labels: Record<string, string> = {
    INSTITUTE_EVENT: "Institute event",
    GUEST_LECTURE: "Guest lecture",
    DEPARTMENT_EVENT: "Department event",
    CLUB_EVENT: "Club event",
  };
  return labels[category] ?? category.toLowerCase().replaceAll("_", " ");
}

export function currentDecision(request: unknown): Record<string, unknown> | null {
  const record = asRecord(request);
  const decisions = asArray(record.decisions);
  const current =
    decisions.find((value) => asRecord(value).isCurrent === true) ??
    asRecord(record.currentDecision);
  return Object.keys(asRecord(current)).length ? asRecord(current) : null;
}

export function isLabBooking(request: unknown): boolean {
  const record = asRecord(request);
  const types = asArray(record.roomTypes);
  return types.some((type) => typeof type === "string" && type.toLowerCase() === "lab");
}
