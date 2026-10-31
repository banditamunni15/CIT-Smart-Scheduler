"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { get, post } from "@/lib/api";
import { formatDate } from "@/lib/admin-data";
import { RequireRole } from "@/components/require-role";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { JobProgressDialog } from "@/components/job-progress-dialog";
import { PaginationBar } from "@/components/pagination-bar";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton } from "@/components/table-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ExamSchedule = {
  id: string;
  status: string;
  hardViolationCount: number;
  softPenalty: number;
  publishedAt: string | null;
  createdAt: string;
};

type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

function ExamsListContent() {
  const client = useQueryClient();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [jobId, setJobId] = useState<string | null>(null);
  const schedules = useQuery({
    queryKey: ["admin", "exam-schedules", page],
    queryFn: () =>
      get<PageData<ExamSchedule>>(`/api/exams?page=${page}&limit=10`),
  });
  const generate = useMutation({
    mutationFn: () => post<{ jobId: string }>("/api/exams/generate"),
    onSuccess: ({ jobId: nextJobId }) => setJobId(nextJobId),
  });
  const onJobSuccess = (resultId: string | null) => {
    setJobId(null);
    if (resultId) {
      router.push(`/admin/exams/${encodeURIComponent(resultId)}`);
    } else {
      void client.invalidateQueries({ queryKey: ["admin", "exam-schedules"] });
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Exam schedules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate, review, and publish exam schedules.
          </p>
        </div>
        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
          <Plus aria-hidden="true" />
          {generate.isPending ? "Starting…" : "Generate exams"}
        </Button>
      </header>
      {generate.isError ? (
        <ErrorState error={generate.error} onRetry={() => generate.mutate()} />
      ) : null}
      <Card className="border border-border shadow-xs">
        <CardHeader><CardTitle>Exam schedule history</CardTitle></CardHeader>
        <CardContent className="p-0">
          {schedules.isPending ? (
            <div className="p-4"><TableSkeleton rows={5} columns={5} /></div>
          ) : schedules.isError ? (
            <div className="p-4">
              <ErrorState error={schedules.error} onRetry={() => void schedules.refetch()} />
            </div>
          ) : schedules.data.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={FileText}
                description="Generated exam schedules will appear here."
                action={<Button onClick={() => generate.mutate()}>Generate exams</Button>}
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Schedule</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Hard violations</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Soft penalty</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Created</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Published</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.data.items.map((schedule) => (
                    <TableRow key={schedule.id} className="h-11">
                      <TableCell>
                        <Link href={`/admin/exams/${encodeURIComponent(schedule.id)}`} className="font-medium hover:underline">
                          {schedule.id}
                        </Link>
                      </TableCell>
                      <TableCell><StatusBadge status={schedule.status} /></TableCell>
                      <TableCell>{schedule.hardViolationCount}</TableCell>
                      <TableCell>{schedule.softPenalty}</TableCell>
                      <TableCell>{formatDate(schedule.createdAt)}</TableCell>
                      <TableCell>{formatDate(schedule.publishedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationBar data={schedules.data} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
      <JobProgressDialog
        jobId={jobId}
        onSuccess={onJobSuccess}
        onClose={() => setJobId(null)}
      />
    </div>
  );
}

export default function AdminExamsPage() {
  return <RequireRole roles={["ADMIN"]}><ExamsListContent /></RequireRole>;
}
