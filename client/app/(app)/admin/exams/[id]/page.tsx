"use client";

import Link from "next/link";
import { Fragment } from "react";
import { Suspense, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, FileText } from "lucide-react";
import { get, post } from "@/lib/api";
import { asArray, asRecord, prettyJson } from "@/lib/admin-data";
import { normalizePublicGroups, type PublicOption } from "@/lib/public-data";
import { showApiError } from "@/lib/errors";
import { RequireRole } from "@/components/require-role";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton } from "@/components/table-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ExamScheduleDetail = {
  id: string;
  datasetId: string;
  status: string;
  exams: unknown;
  report: unknown;
  hardViolationCount: number;
  softPenalty: number;
  publishedAt: string | null;
};
type ExamEntry = {
  id: string;
  course: string;
  day: string;
  session: "AM" | "PM";
  rooms: string[];
  groups: string[];
};

const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const sessions = ["AM", "PM"] as const;

function examEntries(raw: unknown): ExamEntry[] {
  return asArray(raw).map((value, index) => {
    const exam = asRecord(value);
    const courseValue = exam.course ?? exam.course_id;
    const courseRecord = asRecord(courseValue);
    const course =
      typeof courseValue === "string"
        ? courseValue
        : String(courseRecord.course_id ?? courseRecord.id ?? courseRecord.code ?? "Course");
    const groupsRaw = exam.group_ids ?? exam.group_id ?? exam.groups;
    const groups = Array.isArray(groupsRaw)
      ? groupsRaw.map((group) => {
          if (typeof group === "string") return group;
          const record = asRecord(group);
          return String(record.group_id ?? record.id ?? "");
        }).filter(Boolean)
      : typeof groupsRaw === "string"
        ? [groupsRaw]
        : [];
    return {
      id: String(exam.exam_id ?? exam.id ?? `exam-${index}`),
      course,
      day: String(exam.day ?? "").slice(0, 3).toUpperCase(),
      session: exam.session === "PM" ? "PM" : "AM",
      rooms: asArray(exam.rooms).map((room) => {
        if (typeof room === "string") return room;
        const record = asRecord(room);
        return String(record.room_id ?? record.id ?? "");
      }).filter(Boolean),
      groups,
    };
  });
}

function ExamScheduleDetailContent() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const [groupId, setGroupId] = useState("ALL");
  const schedule = useQuery({
    queryKey: ["admin", "exam-schedule", id],
    queryFn: () => get<ExamScheduleDetail>(`/api/exams/${encodeURIComponent(id)}`),
  });
  const groups = useQuery({
    queryKey: ["public", "groups"],
    queryFn: async () => normalizePublicGroups(await get<unknown>("/api/public/groups")),
  });
  const publish = useMutation({
    mutationFn: () => post(`/api/exams/${encodeURIComponent(id)}/publish`),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin", "exam-schedule", id] }),
        client.invalidateQueries({ queryKey: ["admin", "exam-schedules"] }),
      ]);
    },
    onError: showApiError,
  });

  const allExams = useMemo(() => examEntries(schedule.data?.exams), [schedule.data?.exams]);
  const filtered = groupId === "ALL"
    ? allExams
    : allExams.filter((exam) => exam.groups.includes(groupId));
  const report = asRecord(schedule.data?.report);
  const canPublish = schedule.data?.status === "DRAFT";

  if (schedule.isPending) return <TableSkeleton rows={5} columns={4} />;
  if (schedule.isError) {
    return <ErrorState error={schedule.error} onRetry={() => void schedule.refetch()} />;
  }
  if (!schedule.data) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button nativeButton={false} variant="link" size="sm" render={<Link href="/admin/exams" />}>
            <ChevronLeft aria-hidden="true" /> Exam schedules
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Exam schedule</h1>
            <StatusBadge status={schedule.data.status} />
          </div>
          <p className="text-xs text-muted-foreground">{schedule.data.id}</p>
        </div>
        {canPublish ? (
          <ConfirmDialog
            trigger={<Button disabled={publish.isPending}>Publish schedule</Button>}
            title="Publish this exam schedule?"
            description="This will make the exam schedule available to users."
            confirmLabel="Publish"
            onConfirm={() => publish.mutateAsync()}
          />
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border border-border shadow-xs">
          <CardHeader><CardTitle className="text-sm">Hard violations</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{schedule.data.hardViolationCount}</CardContent>
        </Card>
        <Card className="border border-border shadow-xs">
          <CardHeader><CardTitle className="text-sm">Soft penalty</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{schedule.data.softPenalty}</CardContent>
        </Card>
      </div>

      <Card className="border border-border shadow-xs">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Exam sessions</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">MON-SAT, morning and afternoon sessions.</p>
          </div>
          <div className="w-full max-w-xs">
            <label className="mb-2 block text-sm font-medium">Filter by group</label>
            {groups.isPending ? <TableSkeleton rows={1} columns={1} /> : groups.isError ? (
              <ErrorState error={groups.error} onRetry={() => void groups.refetch()} />
            ) : (
              <Select value={groupId} onValueChange={(value) => value && setGroupId(value)}>
                <SelectTrigger aria-label="Filter exams by group"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All groups</SelectItem>
                  {groups.data.map((group: PublicOption) => (
                    <SelectItem key={group.id} value={group.id}>{group.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              description="No exams match this group filter."
            />
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[780px] grid-cols-[90px_repeat(6,minmax(110px,1fr))] rounded-md border">
                <div className="border-b border-r bg-muted/40 p-3 text-xs font-medium text-muted-foreground" />
                {days.map((day) => (
                  <div key={day} className="border-b border-r bg-muted/40 p-3 text-center text-xs font-semibold last:border-r-0">{day}</div>
                ))}
                {sessions.map((session) => (
                  <Fragment key={session}>
                    <div className="border-b border-r bg-muted/20 p-3 text-xs font-medium">
                      {session}<span className="mt-1 block font-normal text-muted-foreground">{session === "AM" ? "09:30-11:30" : "14:00-16:00"}</span>
                    </div>
                    {days.map((day) => {
                      const cellExams = filtered.filter((exam) => exam.day === day && exam.session === session);
                      return (
                        <div key={`${session}-${day}`} className="min-h-28 space-y-2 border-b border-r p-2 last:border-r-0">
                          {cellExams.map((exam) => (
                            <div key={exam.id} className="rounded-md border bg-card p-2 text-xs">
                              <p className="font-semibold">{exam.id}</p>
                              <p className="mt-1 text-muted-foreground">{exam.course}</p>
                              <p className="mt-1 text-muted-foreground">{exam.rooms.join(", ") || "No room assigned"}</p>
                            </div>
                          ))}
                          {cellExams.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : null}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-border shadow-xs">
        <CardHeader><CardTitle>Generation report</CardTitle></CardHeader>
        <CardContent>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
            {prettyJson(report)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminExamDetailPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <Suspense fallback={<TableSkeleton rows={5} columns={4} />}>
        <ExamScheduleDetailContent />
      </Suspense>
    </RequireRole>
  );
}
