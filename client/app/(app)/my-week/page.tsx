"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { get } from "@/lib/api";
import { asArray } from "@/lib/admin-data";
import { RequireRole } from "@/components/require-role";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { TableSkeleton } from "@/components/table-skeleton";
import { TimetableGrid } from "@/components/timetable-grid";
import { Button } from "@/components/ui/button";

function MyWeekContent() {
  const timetable = useQuery({
    queryKey: ["timetable", "me"],
    queryFn: () => get<unknown>("/api/timetables/me"),
  });
  if (timetable.isPending) return <TableSkeleton rows={8} columns={6} />;
  if (timetable.isError) return <ErrorState error={timetable.error} onRetry={() => void timetable.refetch()} />;
  const entries = asArray(timetable.data);
  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-semibold tracking-tight">My week</h1><p className="mt-1 text-sm text-muted-foreground">Your sessions on the published timetable.</p></header>
      {entries.length ? (
        <TimetableGrid
          entries={entries}
          mode="faculty"
          sheetAction={(entry) => (
            <Button nativeButton={false} className="w-full" render={<Link href={`/changes/new?sessionId=${encodeURIComponent(entry.id)}`} />}>
              Request a change for this class
            </Button>
          )}
        />
      ) : (
        <EmptyState icon={CalendarDays} description="No sessions were found on your published timetable." />
      )}
    </div>
  );
}

export default function MyWeekPage() {
  return <RequireRole roles={["FACULTY"]}><MyWeekContent /></RequireRole>;
}
