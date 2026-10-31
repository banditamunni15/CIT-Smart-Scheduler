"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft } from "lucide-react";
import { get, post, del } from "@/lib/api";
import { asArray, asRecord, prettyJson } from "@/lib/admin-data";
import { normalizeEntry } from "@/lib/timetable-adapter";
import { showApiError } from "@/lib/errors";
import { RequireRole } from "@/components/require-role";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton } from "@/components/table-skeleton";
import { TimetableGrid } from "@/components/timetable-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TimetableDetail = {
  id: string;
  status: string;
  label: string | null;
  schedule: unknown;
  report: unknown;
  hardViolationCount: number;
  softTotal: number;
  softBreakdown: unknown;
  solverMeta: unknown;
  dataset: { data: unknown };
};

const softObjectiveLabels: Record<string, string> = {
  S1: "Faculty schedule compactness",
  S2: "Student group schedule compactness",
  S3: "Preferred time slots",
  S4: "Room preferences",
  S5: "Spread sessions across the week",
  S6: "Avoid undesirable periods",
};

function optionId(value: unknown, keys: string[]) {
  const record = asRecord(value);
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  return "";
}

function optionLabel(value: unknown, fallback: string) {
  const record = asRecord(value);
  for (const key of ["name", "label", "title", "faculty_name", "room_name"]) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  return fallback;
}

function TimetableDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const [view, setView] = useState("group");
  const [selection, setSelection] = useState("");
  const timetable = useQuery({
    queryKey: ["admin", "timetable", id],
    queryFn: () => get<TimetableDetail>(`/api/timetables/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
  const actionMutation = useMutation({
    mutationFn: async (action: "validate" | "publish" | "delete") => {
      const path = `/api/timetables/${encodeURIComponent(id)}`;
      if (action === "validate") return post(`${path}/validate`);
      if (action === "publish") return post(`${path}/publish`);
      return del(path);
    },
    onSuccess: async (_result, action) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin", "timetable", id] }),
        client.invalidateQueries({ queryKey: ["admin", "timetables"] }),
      ]);
      if (action === "delete") router.replace("/admin/timetables");
    },
    onError: showApiError,
  });

  const dataset = asRecord(timetable.data?.dataset.data);
  const datasetSessions = asArray(dataset.sessions);
  const sessionById = new Map(
    datasetSessions.map((session) => [
      optionId(session, ["session_id", "id"]),
      asRecord(session),
    ]),
  );
  const schedule = asRecord(timetable.data?.schedule);
  const placements = asArray(schedule.sessions);
  const entries = placements.flatMap((placement) => {
    const placementRecord = asRecord(placement);
    const sessionId = optionId(placementRecord, ["session_id", "id"]);
    const session = sessionById.get(sessionId);
    if (!session) return [];
    return [normalizeEntry({ ...session, ...placementRecord })];
  });

  const fields =
    view === "group"
      ? { field: "groups", ids: ["group_id", "id"] }
      : view === "faculty"
        ? { field: "faculty", ids: ["faculty_id", "id"] }
        : { field: "rooms", ids: ["room_id", "id"] };
  const options = asArray(dataset[fields.field])
    .map((item) => {
      const idValue = optionId(item, fields.ids);
      return idValue ? { id: idValue, label: optionLabel(item, idValue) } : null;
    })
    .filter((item): item is { id: string; label: string } => item !== null);

  const chosen = selection || options[0]?.id || "";
  const filteredEntries = entries.filter((entry) => {
    if (!chosen) return false;
    if (view === "group") return entry.groups.includes(chosen);
    if (view === "faculty") return entry.faculty.includes(chosen);
    return entry.roomId === chosen;
  });

  const report = asRecord(timetable.data?.report);
  const breakdown = asRecord(timetable.data?.softBreakdown);
  const hardCount = timetable.data?.hardViolationCount ?? Number(report.hard_violation_count ?? 0);
  const draft = timetable.data?.status === "DRAFT";

  if (timetable.isPending) return <TableSkeleton rows={5} columns={4} />;
  if (timetable.isError) {
    return <ErrorState error={timetable.error} onRetry={() => void timetable.refetch()} />;
  }
  if (!timetable.data) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button nativeButton={false} variant="link" size="sm" render={<Link href="/admin/timetables" />}>
            <ChevronLeft aria-hidden="true" /> Timetables
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {timetable.data.label || "Timetable"}
            </h1>
            <StatusBadge status={timetable.data.status} />
          </div>
          <p className="text-xs text-muted-foreground">{timetable.data.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft ? (
            <>
              <Button
                variant="outline"
                disabled={actionMutation.isPending}
                onClick={() => actionMutation.mutate("validate")}
              >
                Validate
              </Button>
              <ConfirmDialog
                trigger={<Button disabled={actionMutation.isPending}>Publish</Button>}
                title="Publish this timetable?"
                description="Publishing replaces the live timetable for the active dataset."
                confirmLabel="Publish"
                onConfirm={() => actionMutation.mutateAsync("publish")}
              />
              <ConfirmDialog
                trigger={<Button variant="destructive" disabled={actionMutation.isPending}>Delete</Button>}
                title="Delete this draft?"
                description="This draft timetable will be permanently deleted."
                confirmLabel="Delete draft"
                onConfirm={() => actionMutation.mutateAsync("delete")}
              />
            </>
          ) : null}
        </div>
      </header>

      <Tabs defaultValue="grid">
        <TabsList>
          <TabsTrigger value="grid">Grid</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>
        <TabsContent value="grid" className="mt-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-full max-w-48">
              <label className="mb-2 block text-sm font-medium">View by</label>
              <Select value={view} onValueChange={(value) => {
                if (value) {
                  setView(value);
                  setSelection("");
                }
              }}>
                <SelectTrigger aria-label="View timetable by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="group">Group</SelectItem>
                  <SelectItem value="faculty">Faculty</SelectItem>
                  <SelectItem value="room">Room</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full max-w-sm">
              <label className="mb-2 block text-sm font-medium">
                {view === "group" ? "Group" : view === "faculty" ? "Faculty" : "Room"}
              </label>
              {options.length ? (
                <Select value={chosen || null} onValueChange={(value) => setSelection(value ?? "")}>
                  <SelectTrigger aria-label={`Select ${view}`}>
                    <SelectValue placeholder={`Select ${view}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">No {view} entries in this dataset.</p>
              )}
            </div>
          </div>
          {filteredEntries.length ? (
            <TimetableGrid entries={filteredEntries} mode={view === "faculty" ? "faculty" : view === "room" ? "room" : "group"} />
          ) : (
            <EmptyState
              icon={CalendarDays}
              description="No sessions match this view."
            />
          )}
        </TabsContent>
        <TabsContent value="report" className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="border border-border shadow-xs">
              <CardHeader><CardTitle className="text-sm">Hard violations</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{hardCount}</CardContent>
            </Card>
            <Card className="border border-border shadow-xs">
              <CardHeader><CardTitle className="text-sm">Soft total</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{timetable.data.softTotal}</CardContent>
            </Card>
          </div>
          <Card className="border border-border shadow-xs">
            <CardHeader><CardTitle>Soft penalty breakdown</CardTitle></CardHeader>
            <CardContent className="p-0">
              {Object.keys(breakdown).length ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Objective</TableHead>
                      <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">Penalty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {["S1", "S2", "S3", "S4", "S5", "S6"].map((key) => (
                      <TableRow key={key} className="h-11">
                        <TableCell>{softObjectiveLabels[key]}</TableCell>
                        <TableCell className="text-right tabular-nums">{String(breakdown[key] ?? 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-4 text-sm text-muted-foreground">No soft penalty details were reported.</div>
              )}
            </CardContent>
          </Card>
          <Card className="border border-border shadow-xs">
            <CardHeader><CardTitle>Solver metadata</CardTitle></CardHeader>
            <CardContent>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                {prettyJson(timetable.data.solverMeta)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function TimetableDetailPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <Suspense fallback={<TableSkeleton rows={5} columns={4} />}>
        <TimetableDetailContent />
      </Suspense>
    </RequireRole>
  );
}
