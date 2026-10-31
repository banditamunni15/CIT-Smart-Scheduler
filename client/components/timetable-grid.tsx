"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  normalizeEntry,
  type TimetableEntry,
} from "@/lib/timetable-adapter";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type TimetableMode = "group" | "faculty" | "room";

const days = ["MON", "TUE", "WED", "THU", "FRI"];
const periods = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const periodTimes: Record<number, string> = {
  1: "08:00",
  2: "09:00",
  3: "10:00",
  4: "11:00",
  5: "12:00",
  6: "14:00",
  7: "15:00",
  8: "16:00",
  9: "17:00",
};
const rowForPeriod = (period: number) => (period <= 5 ? period : period + 1);

function slotFor(entry: TimetableEntry, mode: TimetableMode) {
  if (mode === "group") return entry.groups.join(", ");
  if (mode === "faculty") return entry.faculty.join(", ");
  return entry.roomId;
}

function kindLabel(kind: string) {
  const normalized = kind.toLowerCase();
  if (
    normalized.includes("lab") ||
    normalized === "p" ||
    normalized === "practical"
  ) {
    return "Lab";
  }
  if (normalized.includes("lecture") || normalized === "lec" || normalized === "l") {
    return "L";
  }
  if (normalized.includes("tutorial") || normalized === "tut" || normalized === "t") {
    return "T";
  }
  return kind;
}

export function TimetableGrid({
  entries,
  mode,
  onCellClick,
  sheetAction,
}: {
  entries: unknown[];
  mode: TimetableMode;
  onCellClick?: (entry: TimetableEntry) => void;
  sheetAction?: (entry: TimetableEntry) => ReactNode;
}) {
  const normalizedEntries = useMemo(() => entries.map(normalizeEntry), [entries]);
  const [selected, setSelected] = useState<TimetableEntry | null>(null);

  const openEntry = (entry: TimetableEntry) => {
    onCellClick?.(entry);
    setSelected(entry);
  };

  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[76px_repeat(5,minmax(160px,1fr))] border-b bg-muted/40">
            <div className="h-11 border-r" />
            {days.map((day) => (
              <div
                key={day}
                className="flex h-11 items-center justify-center border-r text-xs font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[76px_repeat(5,minmax(160px,1fr))]">
            <div
              className="grid border-r"
              style={{ gridTemplateRows: "repeat(5, 64px) 28px repeat(4, 64px)" }}
            >
              {periods.map((period) => (
                <div
                  key={period}
                  className="flex flex-col justify-center border-b px-2 text-[11px] leading-4 text-muted-foreground"
                  style={{ gridRow: rowForPeriod(period) }}
                >
                  <span className="font-medium text-foreground">P{period}</span>
                  <span>{periodTimes[period]}</span>
                </div>
              ))}
              <div className="flex items-center justify-center border-b bg-muted/70 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" style={{ gridRow: 6 }}>
                Lunch
              </div>
            </div>
            {days.map((day) => {
              const dailyEntries = normalizedEntries.filter(
                (entry) => entry.day === day,
              );
              const laneById = new Map<string, number>();
              const laneIntervals: Array<{ lane: number; start: number; end: number }> = [];
              for (const entry of [...dailyEntries].sort(
                (left, right) => left.startPeriod - right.startPeriod,
              )) {
                if (
                  !Number.isInteger(entry.startPeriod) ||
                  entry.startPeriod < 1 ||
                  entry.startPeriod > 9
                ) {
                  continue;
                }
                const end = Math.min(
                  entry.startPeriod + entry.duration - 1,
                  entry.startPeriod <= 5 ? 5 : 9,
                );
                let lane = 0;
                while (
                  laneIntervals.some(
                    (interval) =>
                      interval.lane === lane &&
                      interval.start <= end &&
                      entry.startPeriod <= interval.end,
                  )
                ) {
                  lane += 1;
                }
                laneIntervals.push({ lane, start: entry.startPeriod, end });
                laneById.set(entry.id, lane);
              }
              const laneCount = Math.max(
                2,
                ...Array.from(laneById.values(), (lane) => lane + 1),
              );
              return (
                <div
                  key={day}
                  className="relative grid border-r last:border-r-0"
                  style={{
                    gridTemplateColumns: `repeat(${laneCount}, minmax(0, 1fr))`,
                    gridTemplateRows: "repeat(5, 64px) 28px repeat(4, 64px)",
                  }}
                >
                  {periods.map((period) => (
                    <div
                      key={period}
                      className="pointer-events-none border-b"
                      style={{
                        gridColumn: "1 / -1",
                        gridRow: rowForPeriod(period),
                      }}
                    />
                  ))}
                  <div
                    className="pointer-events-none border-y bg-muted/50"
                    style={{ gridColumn: "1 / -1", gridRow: 6 }}
                  />
                  {dailyEntries.map((entry) => {
                    if (
                      !Number.isInteger(entry.startPeriod) ||
                      entry.startPeriod < 1 ||
                      entry.startPeriod > 9
                    ) {
                      return null;
                    }
                    const endPeriod = Math.min(
                      entry.startPeriod + entry.duration - 1,
                      entry.startPeriod <= 5 ? 5 : 9,
                    );
                    const lane = laneById.get(entry.id) ?? 0;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => openEntry(entry)}
                        aria-label={`${entry.courseTitle}, ${slotFor(entry, mode)}, ${day} period ${entry.startPeriod}`}
                        className="z-10 m-1 flex min-w-0 flex-col items-start overflow-hidden rounded-md border border-gray-200 bg-white p-2 text-left text-xs hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        style={{
                          gridColumn: `${lane + 1}`,
                          gridRow: `${rowForPeriod(entry.startPeriod)} / ${rowForPeriod(endPeriod) + 1}`,
                        }}
                      >
                        <span className="w-full truncate font-semibold">
                          {entry.courseId}
                        </span>
                        <span className="w-full truncate text-muted-foreground">
                          {entry.roomId}
                        </span>
                        <span className="mt-1 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {kindLabel(entry.kind)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.courseTitle}</SheetTitle>
                <SheetDescription>
                  {selected.day} · Period {selected.startPeriod} ·{" "}
                  {slotFor(selected, mode)}
                </SheetDescription>
              </SheetHeader>
              <dl className="mt-6 space-y-4 px-4">
                {selected.details.map((detail) => (
                  <div key={detail.label} className="border-b pb-3 last:border-0">
                    <dt className="text-xs font-medium text-muted-foreground">
                      {detail.label}
                    </dt>
                    <dd className="mt-1 text-sm">{detail.value}</dd>
                  </div>
                ))}
              </dl>
              {sheetAction ? <div className="px-4 pt-5">{sheetAction(selected)}</div> : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
