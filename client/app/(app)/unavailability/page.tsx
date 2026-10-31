"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff } from "lucide-react";
import { get, post } from "@/lib/api";
import { asArray, asRecord, formatDate } from "@/lib/admin-data";
import { RequireRole } from "@/components/require-role";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { JobProgressDialog } from "@/components/job-progress-dialog";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton } from "@/components/table-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const days = ["MON", "TUE", "WED", "THU", "FRI"] as const;

function UnavailabilityContent() {
  const router = useRouter();
  const client = useQueryClient();
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [reason, setReason] = useState("");
  const [errorText, setErrorText] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [changeId, setChangeId] = useState<string | null>(null);
  const changes = useQuery({
    queryKey: ["changes", "my-unavailability"],
    queryFn: () => get<unknown>("/api/changes"),
  });
  const previous = asArray(changes.data).filter((raw) => {
    const item = asRecord(raw);
    return item.source === "FACULTY_UNAVAILABILITY";
  });
  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedDays.length) throw new Error("Select at least one day.");
      if (!reason.trim()) throw new Error("Enter a reason.");
      const start = periodStart ? Number(periodStart) : undefined;
      const end = periodEnd ? Number(periodEnd) : undefined;
      if ((start === undefined) !== (end === undefined)) {
        throw new Error("Enter both ends of the optional period range.");
      }
      if (start !== undefined && end !== undefined && (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > 9)) {
        throw new Error("Enter a period range from 1 to 9 with the end no earlier than the start.");
      }
      const periods = start !== undefined && end !== undefined
        ? Array.from({ length: end - start + 1 }, (_value, index) => start + index)
        : undefined;
      return post<{ jobId: string; changeId: string }>("/api/changes/unavailability", {
        days: selectedDays,
        ...(periods ? { periods } : {}),
        reason: reason.trim(),
      });
    },
    onSuccess: async (result) => {
      setChangeId(result.changeId);
      setJobId(result.jobId);
      await client.invalidateQueries({ queryKey: ["changes"] });
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : "Could not submit unavailability."),
  });

  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-semibold tracking-tight">Unavailability</h1><p className="mt-1 text-sm text-muted-foreground">Tell scheduling when you are unavailable to teach.</p></header>
      <Card className="border border-border shadow-xs">
        <CardHeader><CardTitle>Mark unavailable</CardTitle><CardDescription>Select one or more days and optionally list specific periods.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">{days.map((day) => <Button key={day} type="button" size="sm" variant={selectedDays.includes(day) ? "default" : "outline"} aria-pressed={selectedDays.includes(day)} onClick={() => setSelectedDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])}>{day}</Button>)}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input aria-label="Period range start (optional)" type="number" min={1} max={9} placeholder="Period range start (optional)" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
            <Input aria-label="Period range end (optional)" type="number" min={1} max={9} placeholder="Period range end (optional)" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
          </div>
          <Textarea aria-label="Reason" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          {errorText ? <Alert variant="destructive"><AlertTitle>Could not submit</AlertTitle><AlertDescription>{errorText}</AlertDescription></Alert> : null}
          <Button onClick={() => { setErrorText(""); mutation.mutate(); }} disabled={mutation.isPending}>{mutation.isPending ? "Submitting…" : "Submit unavailability"}</Button>
        </CardContent>
      </Card>

      <Card className="border border-border shadow-xs">
        <CardHeader><CardTitle>Previous requests</CardTitle></CardHeader>
        <CardContent className="p-0">
          {changes.isPending ? <div className="p-4"><TableSkeleton rows={4} columns={4} /></div> : changes.isError ? <div className="p-4"><ErrorState error={changes.error} onRetry={() => void changes.refetch()} /></div> : previous.length === 0 ? (
            <div className="p-4"><EmptyState icon={BellOff} description="You have not submitted any unavailability requests yet." /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Submitted</TableHead><TableHead>Status</TableHead><TableHead>Explanation</TableHead></TableRow></TableHeader>
                <TableBody>{previous.map((raw) => {
                  const item = asRecord(raw);
                  const disruption = asRecord(item.disruption);
                  const firstChange = asRecord(asArray(disruption.changes)[0]);
                  const summary = typeof firstChange.reason === "string"
                    ? `${asArray(firstChange.days).join(", ")} · ${firstChange.reason}`
                    : "Availability request";
                  return <TableRow key={String(item.id)} className="h-11"><TableCell>{formatDate(item.createdAt)}</TableCell><TableCell><StatusBadge status={String(item.status ?? "SUBMITTED")} /></TableCell><TableCell className="max-w-md truncate">{String(item.explanation ?? summary)}</TableCell></TableRow>;
                })}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <JobProgressDialog
        jobId={jobId}
        onSuccess={() => { setJobId(null); if (changeId) router.push(`/changes/${encodeURIComponent(changeId)}`); }}
        onClose={() => { setJobId(null); if (changeId) router.push(`/changes/${encodeURIComponent(changeId)}`); }}
      />
    </div>
  );
}

export default function UnavailabilityPage() {
  return <RequireRole roles={["FACULTY"]}><UnavailabilityContent /></RequireRole>;
}
