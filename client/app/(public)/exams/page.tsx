"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { ApiClientError, get } from "@/lib/api";
import {
  normalizePublicExams,
  normalizePublicGroups,
  publicExamDayOrder,
  type PublicOption,
} from "@/lib/public-data";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { TableSkeleton } from "@/components/table-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ExamsPage() {
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const groups = useQuery({
    queryKey: ["public", "groups"],
    queryFn: async () => normalizePublicGroups(await get<unknown>("/api/public/groups")),
  });

  const groupId = selectedGroupId || groups.data?.[0]?.id || "";

  const exams = useQuery({
    queryKey: ["public", "exams", groupId],
    queryFn: async () =>
      normalizePublicExams(
        await get<unknown>(`/api/public/exams/group/${encodeURIComponent(groupId)}`),
      ),
    enabled: Boolean(groupId),
  });

  const sortedExams = useMemo(
    () =>
      [...(exams.data ?? [])].sort(
        (left, right) =>
          publicExamDayOrder(left.day) - publicExamDayOrder(right.day) ||
          left.session.localeCompare(right.session) ||
          left.course.localeCompare(right.course),
      ),
    [exams.data],
  );
  const noPublishedExams =
    exams.error instanceof ApiClientError &&
    ["NO_PUBLISHED_EXAMS", "NO_PUBLISHED_EXAM_SCHEDULE"].includes(
      exams.error.code,
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exams</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the published exam schedule for a group.
        </p>
      </div>

      <div className="max-w-sm space-y-2">
        <label className="text-sm font-medium">Group</label>
        {groups.isPending ? (
          <TableSkeleton rows={1} columns={1} />
        ) : groups.isError ? (
          <ErrorState error={groups.error} onRetry={() => void groups.refetch()} />
        ) : groups.data.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            description="No groups are available to browse."
            action={<Button variant="outline" onClick={() => void groups.refetch()}>Retry</Button>}
          />
        ) : (
          <Select value={groupId || null} onValueChange={(value) => setSelectedGroupId(value ?? "")}>
            <SelectTrigger aria-label="Select a group">
              <SelectValue placeholder="Select a group" />
            </SelectTrigger>
            <SelectContent>
              {groups.data.map((group: PublicOption) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {noPublishedExams ? (
        <EmptyState
          icon={CalendarDays}
          title="No exam schedule has been published yet."
          description="Published exam sessions will appear here."
          action={<Button variant="outline" onClick={() => void exams.refetch()}>Refresh</Button>}
        />
      ) : exams.isPending && groupId ? (
        <TableSkeleton rows={5} columns={4} />
      ) : exams.isError ? (
        <ErrorState error={exams.error} onRetry={() => void exams.refetch()} />
      ) : sortedExams.length === 0 && groupId ? (
        <EmptyState
          icon={CalendarDays}
          description="There are no exams scheduled for this group."
          action={<Button variant="outline" onClick={() => void exams.refetch()}>Refresh</Button>}
        />
      ) : sortedExams.length > 0 ? (
        <Card className="border border-border shadow-xs">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Course
                  </TableHead>
                  <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Day
                  </TableHead>
                  <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Session
                  </TableHead>
                  <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Rooms
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedExams.map((exam) => (
                  <TableRow key={exam.id} className="h-11">
                    <TableCell className="font-medium">{exam.course}</TableCell>
                    <TableCell>{exam.day}</TableCell>
                    <TableCell>
                      {exam.session}{" "}
                      <span className="text-muted-foreground">
                        ({exam.session === "AM" ? "09:30-11:30" : "14:00-16:00"})
                      </span>
                    </TableCell>
                    <TableCell>{exam.rooms.join(", ") || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
