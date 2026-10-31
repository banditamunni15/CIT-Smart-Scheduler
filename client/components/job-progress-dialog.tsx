"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { get, ApiClientError } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type JobInfo = {
  id: string;
  state: JobStatus;
  progress: number;
  message: string | null;
  error: string | null;
  resultId: string | null;
  resultType: string | null;
};

export function JobProgressDialog({
  jobId,
  onSuccess,
  onClose,
}: {
  jobId: string | null;
  onSuccess: (resultId: string | null, resultType: string | null) => void;
  onClose: () => void;
}) {
  const notifiedJob = useRef<string | null>(null);
  const query = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => get<JobInfo>(`/api/jobs/${encodeURIComponent(jobId ?? "")}`),
    enabled: jobId !== null,
    retry: false,
    refetchInterval: (queryState) => {
      const state = queryState.state.data?.state;
      return state === "SUCCEEDED" || state === "FAILED" ? false : 1500;
    },
  });
  const job = query.data;
  const notFound =
    query.error instanceof ApiClientError && query.error.statusCode === 404;

  useEffect(() => {
    if (
      job?.state === "SUCCEEDED" &&
      jobId &&
      notifiedJob.current !== jobId
    ) {
      notifiedJob.current = jobId;
      onSuccess(job.resultId, job.resultType);
    }
  }, [job, jobId, onSuccess]);

  useEffect(() => {
    if (jobId === null) notifiedJob.current = null;
  }, [jobId]);

  return (
    <Dialog open={jobId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Job progress</DialogTitle>
          <DialogDescription>
            {jobId ? `Tracking job ${jobId}` : "No active job"}
          </DialogDescription>
        </DialogHeader>

        {notFound ? (
          <div className="flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p>This job could not be found. It may have expired or been removed.</p>
          </div>
        ) : query.isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {query.error instanceof Error
              ? query.error.message
              : "Unable to load job status."}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {job?.message ?? "Waiting for the job to start…"}
              </span>
              {job ? <StatusBadge status={job.state} /> : null}
            </div>
            <Progress value={job?.progress ?? 0} />
            <p className="text-right text-xs tabular-nums text-muted-foreground">
              {job?.progress ?? 0}%
            </p>
            {job?.state === "FAILED" ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {job.error ?? "The job failed without an error message."}
              </div>
            ) : null}
          </div>
        )}

        {job?.state === "FAILED" || notFound || query.isError ? (
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
