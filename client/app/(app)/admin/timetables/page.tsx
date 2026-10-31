"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Timetable = {
  id: string;
  status: string;
  label: string | null;
  hardViolationCount: number;
  softTotal: number;
  createdAt: string;
  publishedAt: string | null;
};

type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

function TimetablesContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [timeLimit, setTimeLimit] = useState([60]);
  const [jobId, setJobId] = useState<string | null>(null);

  const timetables = useQuery({
    queryKey: ["admin", "timetables", page],
    queryFn: () =>
      get<PageData<Timetable>>(`/api/timetables?page=${page}&limit=10`),
  });
  const generate = useMutation({
    mutationFn: () =>
      post<{ jobId: string }>("/api/timetables/generate", {
        timeLimit: timeLimit[0],
      }),
    onSuccess: ({ jobId: newJobId }) => {
      setGenerateOpen(false);
      setJobId(newJobId);
      void queryClient.invalidateQueries({ queryKey: ["admin", "jobs"] });
    },
  });

  const onJobSuccess = (resultId: string | null) => {
    setJobId(null);
    if (resultId) {
      router.push(`/admin/timetables/${encodeURIComponent(resultId)}`);
    } else {
      void queryClient.invalidateQueries({ queryKey: ["admin", "timetables"] });
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Timetables</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate and manage timetable drafts.
          </p>
        </div>
        <Button onClick={() => setGenerateOpen(true)}>
          <Plus aria-hidden="true" />
          Generate timetable
        </Button>
      </header>

      <Card className="border border-border shadow-xs">
        <CardHeader><CardTitle>Timetable history</CardTitle></CardHeader>
        <CardContent className="p-0">
          {timetables.isPending ? (
            <div className="p-4"><TableSkeleton rows={6} columns={6} /></div>
          ) : timetables.isError ? (
            <div className="p-4">
              <ErrorState error={timetables.error} onRetry={() => void timetables.refetch()} />
            </div>
          ) : timetables.data.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={CalendarDays}
                description="Generated timetable drafts will appear here."
                action={<Button onClick={() => setGenerateOpen(true)}>Generate timetable</Button>}
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Timetable</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Hard violations</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Soft total</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Created</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Published</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timetables.data.items.map((timetable) => (
                    <TableRow key={timetable.id} className="h-11">
                      <TableCell>
                        <Link
                          href={`/admin/timetables/${encodeURIComponent(timetable.id)}`}
                          className="font-medium hover:underline"
                        >
                          {timetable.label || timetable.id}
                        </Link>
                      </TableCell>
                      <TableCell><StatusBadge status={timetable.status} /></TableCell>
                      <TableCell>{timetable.hardViolationCount}</TableCell>
                      <TableCell>{timetable.softTotal}</TableCell>
                      <TableCell>{formatDate(timetable.createdAt)}</TableCell>
                      <TableCell>{formatDate(timetable.publishedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationBar data={timetables.data} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      {generate.isError ? (
        <ErrorState error={generate.error} onRetry={() => generate.mutate()} />
      ) : null}

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate timetable</DialogTitle>
            <DialogDescription>
              Choose the solver time limit for this generation job.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between text-sm">
              <label htmlFor="time-limit" className="font-medium">Time limit</label>
              <span className="tabular-nums text-muted-foreground">{timeLimit[0]} seconds</span>
            </div>
            <Slider
              id="time-limit"
              min={5}
              max={300}
              step={5}
              value={timeLimit}
              onValueChange={(value) => setTimeLimit(Array.isArray(value) ? value : [value])}
              aria-label="Time limit in seconds"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5 s</span><span>300 s</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>Cancel</Button>
            <Button disabled={generate.isPending} onClick={() => generate.mutate()}>
              {generate.isPending ? "Starting…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <JobProgressDialog
        jobId={jobId}
        onSuccess={onJobSuccess}
        onClose={() => setJobId(null)}
      />
    </div>
  );
}

export default function TimetablesPage() {
  return <RequireRole roles={["ADMIN"]}><TimetablesContent /></RequireRole>;
}
