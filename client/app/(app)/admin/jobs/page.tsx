"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { get } from "@/lib/api";
import { formatDate, resultHref } from "@/lib/admin-data";
import { RequireRole } from "@/components/require-role";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PaginationBar } from "@/components/pagination-bar";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton } from "@/components/table-skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Job = {
  id: string;
  kind: string;
  state: string;
  progress: number;
  message: string | null;
  resultType: string | null;
  resultId: string | null;
  error: string | null;
  createdAt: string;
};
type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

function JobsContent() {
  const [page, setPage] = useState(1);
  const jobs = useQuery({
    queryKey: ["admin", "jobs", page],
    queryFn: () => get<PageData<Job>>(`/api/jobs?page=${page}&limit=10`),
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (job) => job.state === "QUEUED" || job.state === "RUNNING",
      )
        ? 5000
        : false,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor timetable and exam generation jobs.
        </p>
      </header>
      <Card className="border border-border shadow-xs">
        <CardHeader><CardTitle>Job history</CardTitle></CardHeader>
        <CardContent className="p-0">
          {jobs.isPending ? (
            <div className="p-4"><TableSkeleton rows={6} columns={6} /></div>
          ) : jobs.isError ? (
            <div className="p-4"><ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} /></div>
          ) : jobs.data.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={ListChecks}
                description="Generation and processing jobs will appear here."
                action={
                  <Button nativeButton={false} variant="outline" render={<Link href="/admin/timetables" />}>
                    View timetables
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Job</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Kind</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">State / progress</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Result</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Error</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.data.items.map((job) => {
                    const href = resultHref(job.resultType, job.resultId);
                    return (
                      <TableRow key={job.id} className="h-11">
                        <TableCell className="max-w-40">
                          <span className="block truncate font-mono text-xs" title={job.id}>{job.id}</span>
                        </TableCell>
                        <TableCell>{job.kind.replaceAll("_", " ")}</TableCell>
                        <TableCell className="min-w-36">
                          <div className="space-y-1.5">
                            <StatusBadge status={job.state} />
                            <div className="flex items-center gap-2">
                              <Progress value={job.progress} className="max-w-24" />
                              <span className="text-xs tabular-nums text-muted-foreground">{job.progress}%</span>
                            </div>
                            {job.message ? <p className="max-w-48 truncate text-xs text-muted-foreground">{job.message}</p> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          {href ? (
                            <Link href={href} className="underline underline-offset-2">
                              {job.resultType}
                            </Link>
                          ) : job.resultType ? (
                            <span>{job.resultType}</span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="max-w-64 whitespace-normal text-xs text-destructive">
                          {job.error || "—"}
                        </TableCell>
                        <TableCell>{formatDate(job.createdAt)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <PaginationBar data={jobs.data} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminJobsPage() {
  return <RequireRole roles={["ADMIN"]}><JobsContent /></RequireRole>;
}
