"use client";

import { useMemo, useState } from "react";
import { cn } from "cn";
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

type KindTone = { card: string; text: string; tag: string; dot: string };

const kindTones: Record<string, KindTone> = {
  Lab: {
    card: "border-emerald-200 border-l-emerald-500 bg-emerald-50 hover:bg-emerald-100/70",
    text: "text-emerald-900",
    tag: "border-emerald-300 bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
  },
  L: {
    card: "border-indigo-200 border-l-indigo-500 bg-indigo-50 hover:bg-indigo-100/70",
    text: "text-indigo-900",
    tag: "border-indigo-300 bg-indigo-100 text-indigo-700",
    dot: "bg-indigo-500",
  },
  T: {
    card: "border-amber-200 border-l-amber-500 bg-amber-50 hover:bg-amber-100/70",
    text: "text-amber-900",
    tag: "border-amber-300 bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
  },
};

const fallbackTone: KindTone = {
  card: "border-slate-200 border-l-slate-400 bg-slate-50 hover:bg-slate-100",
  text: "text-slate-900",
  tag: "border-slate-300 bg-slate-100 text-slate-600",
  dot: "bg-slate-400",
};

function toneFor(kind: string): KindTone {
  return kindTones[kindLabel(kind)] ?? fallbackTone;
}

function Legend() {
  const items: Array<[string, KindTone]> = [
    ["Lecture", kindTones.L ?? fallbackTone],
    ["Lab", kindTones.Lab ?? fallbackTone],
    ["Tutorial", kindTones.T ?? fallbackTone],
  ];
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(([label, tone]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("size-2.5 rounded-full", tone.dot)} />
          {label}
        </span>
      ))}
    </div>
  );
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
      <Legend />
      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[76px_repeat(5,minmax(160px,1fr))] border-b bg-linear-to-r from-indigo-50 to-violet-50">
            <div className="h-11 border-r" />
            {days.map((day) => (
              <div
                key={day}
                className="flex h-11 items-center justify-center border-r text-xs font-bold uppercase tracking-wide text-indigo-900/80 last:border-r-0"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[76px_repeat(5,minmax(160px,1fr))]">
            <div
              className="grid border-r"
              style={{ gridTemplateRows: "repeat(5, 72px) 28px repeat(4, 72px)" }}
            >
              {periods.map((period) => (
                <div
                  key={period}
                  className="flex flex-col justify-center border-b px-2 text-[11px] leading-4 text-muted-foreground"
                  style={{ gridRow: rowForPeriod(period) }}
                >
                  <span className="font-semibold text-indigo-700">P{period}</span>
                  <span>{periodTimes[period]}</span>
                </div>
              ))}
              <div className="flex items-center justify-center border-b bg-amber-50 text-[10px] font-bold uppercase tracking-wide text-amber-700" style={{ gridRow: 6 }}>
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
                1,
                ...Array.from(laneById.values(), (lane) => lane + 1),
              );
              return (
                <div
                  key={day}
                  className="relative grid border-r last:border-r-0"
                  style={{
                    gridTemplateColumns: `repeat(${laneCount}, minmax(0, 1fr))`,
                    gridTemplateRows: "repeat(5, 72px) 28px repeat(4, 72px)",
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
                    className="pointer-events-none border-y bg-amber-50/70"
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
                    const tone = toneFor(entry.kind);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => openEntry(entry)}
                        aria-label={`${entry.courseTitle}, ${slotFor(entry, mode)}, ${day} period ${entry.startPeriod}`}
                        className={cn(
                          "z-10 m-1 flex min-w-0 flex-col items-start overflow-hidden rounded-lg border border-l-4 p-1.5 text-left text-xs shadow-xs transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          tone.card,
                        )}
                        style={{
                          gridColumn: `${lane + 1}`,
                          gridRow: `${rowForPeriod(entry.startPeriod)} / ${rowForPeriod(endPeriod) + 1}`,
                        }}
                      >
                        <span className={cn("w-full truncate font-semibold", tone.text)}>
                          {entry.courseId}
                        </span>
                        <span className="flex w-full min-w-0 items-center gap-1 text-muted-foreground">
                          <span className="min-w-0 flex-1 truncate">{entry.roomId}</span>
                          <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] leading-3 font-semibold", tone.tag)}>
                            {kindLabel(entry.kind)}
                          </span>
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
