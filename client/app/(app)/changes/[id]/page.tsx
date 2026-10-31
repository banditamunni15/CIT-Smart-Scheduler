"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock3, MoveRight, PencilRuler } from "lucide-react";
import { ApiClientError, get, post } from "@/lib/api";
import { asArray, asRecord, formatDate, prettyJson } from "@/lib/admin-data";
import { useMe } from "@/lib/session";
import { RequireRole } from "@/components/require-role";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton } from "@/components/table-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ChangeDetail = Record<string, unknown> & {
  id: string;
  status: string;
  source: string;
  requestedById: string;
  requestedBy: Record<string, unknown>;
};

const steps = [
  { status: "SUBMITTED", label: "Submitted" },
  { status: "PROPOSED", label: "Proposed" },
  { status: "DEPT_APPROVED", label: "Dept approved" },
  { status: "APPROVED", label: "Approved" },
];

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return prettyJson(value);
  return String(value);
}

function ChangeDetailContent() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const { data: user } = useMe();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [stale, setStale] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const query = useQuery({
    queryKey: ["change", id],
    queryFn: () => get<ChangeDetail>(`/api/changes/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
  const mutation = useMutation({
    mutationFn: async (action: "approve" | "dept-approve" | "reject" | "withdraw") => {
      if (action === "reject") return post(`/api/changes/${encodeURIComponent(id)}/reject`, { note: rejectNote.trim() });
      return post(`/api/changes/${encodeURIComponent(id)}/${action}`);
    },
    onSuccess: async (_result, action) => {
      setActionError(null);
      setStale(false);
      if (action === "reject") setRejectOpen(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["change", id] }),
        client.invalidateQueries({ queryKey: ["changes"] }),
      ]);
    },
    onError: (error) => {
      setActionError(error);
      setStale(error instanceof ApiClientError && error.code === "STALE_STATE");
    },
  });

  if (query.isPending) return <TableSkeleton rows={5} columns={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const change = query.data;
  if (!change) return null;
  const requester = asRecord(change.requestedBy);
  const status = change.status;
  const currentStep = steps.findIndex((step) => step.status === status);
  const diff = asArray(change.diff);
  const requesterIsOwner = user?.id === change.requestedById;
  const admin = user?.role === "ADMIN";
  const coordinator = user?.role === "COORDINATOR";
  const canWithdraw = requesterIsOwner && status === "SUBMITTED";
  const canDeptApprove =
    coordinator &&
    status === "PROPOSED" &&
    requester.role === "FACULTY" &&
    requester.department === user?.department &&
    change.requestedById !== user?.id;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button nativeButton={false} variant="link" size="sm" render={<Link href="/changes" />}><ArrowLeft aria-hidden="true" /> Changes</Button>
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">Change proposal</h1><StatusBadge status={status} /></div>
          <p className="text-xs text-muted-foreground">{change.id} · {String(change.source).replaceAll("_", " ")} · {formatDate(change.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {admin && (status === "PROPOSED" || status === "DEPT_APPROVED") ? (
            <ConfirmDialog
              trigger={<Button disabled={mutation.isPending}>Approve change</Button>}
              title="Apply this timetable change?"
              description="The approved timetable will replace the live timetable for everyone."
              confirmLabel="Approve and publish"
              onConfirm={() => mutation.mutateAsync("approve")}
            />
          ) : null}
          {admin && (status === "PROPOSED" || status === "DEPT_APPROVED") ? <Button variant="outline" onClick={() => setRejectOpen(true)}>Reject</Button> : null}
          {canDeptApprove ? <Button onClick={() => mutation.mutate("dept-approve")} disabled={mutation.isPending}>Department approve</Button> : null}
          {canWithdraw ? <Button variant="outline" onClick={() => mutation.mutate("withdraw")} disabled={mutation.isPending}>Withdraw</Button> : null}
        </div>
      </header>

      {stale ? <Alert variant="destructive"><AlertTitle>The base timetable changed</AlertTitle><AlertDescription>The base timetable changed, submit again.</AlertDescription></Alert> : null}
      {actionError && !stale ? <Alert variant="destructive"><AlertTitle>Action could not be completed</AlertTitle><AlertDescription>{actionError instanceof Error ? actionError.message : "Try again."}</AlertDescription></Alert> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Moved", value: change.movedCount, icon: MoveRight },
          { label: "Time changed", value: change.timeChangedCount, icon: Clock3 },
          { label: "Room only", value: change.roomOnlyCount, icon: PencilRuler },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border border-border shadow-xs">
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{typeof value === "number" ? value : "—"}</p></div>
              <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-border shadow-xs">
        <CardHeader><CardTitle>Proposal progress</CardTitle></CardHeader>
        <CardContent>
          <ol className="grid gap-3 sm:grid-cols-4">
            {steps.map((step, index) => {
              const completed = currentStep >= index && currentStep >= 0;
              const active = step.status === status;
              return (
                <li key={step.status} className={`flex items-center gap-2 rounded-md border p-3 text-sm ${completed ? "border-foreground/30" : "border-border text-muted-foreground"}`}>
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs ${completed ? "border-foreground bg-foreground text-background" : "border-border"}`}>{completed ? "✓" : index + 1}</span>
                  <span className={active ? "font-semibold" : ""}>{step.label}</span>
                </li>
              );
            })}
          </ol>
          {status === "REJECTED" || status === "WITHDRAWN" || status === "IMPOSSIBLE" ? <div className="mt-3"><StatusBadge status={status} /></div> : null}
        </CardContent>
      </Card>

      {status === "IMPOSSIBLE" ? (
        <Alert variant="destructive">
          <AlertTitle>Timetable repair was impossible</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{String(change.explanation ?? "No explanation was provided.")}</p>
            <div>
              <p className="mb-1 font-medium">Conflicting rules</p>
              {asArray(change.conflicts).length ? (
                <ul className="list-disc space-y-1 pl-5">{asArray(change.conflicts).map((conflict, index) => <li key={index}>{typeof conflict === "string" ? conflict : display(conflict)}</li>)}</ul>
              ) : <p>No conflict details were provided.</p>}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="border border-border shadow-xs">
        <CardHeader><CardTitle>Schedule differences</CardTitle><CardDescription>{diff.length} changed session{diff.length === 1 ? "" : "s"}.</CardDescription></CardHeader>
        <CardContent className="p-0">
          {diff.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="hover:bg-transparent">
                  {["Session", "Course", "From day / period / room", "To day / period / room", "Changed fields"].map((item) => <TableHead key={item} className="text-[11px] uppercase tracking-wide text-muted-foreground">{item}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>{diff.map((raw, index) => {
                  const row = asRecord(raw);
                  const from = asRecord(row.from);
                  const to = asRecord(row.to);
                  const session = row.session ?? row.session_id ?? from.session_id ?? to.session_id;
                  const course = row.course ?? row.course_id ?? from.course_id ?? to.course_id;
                  const fromParts = [
                    { label: display(from.day), changed: from.day !== to.day },
                    { label: `P${display(from.start ?? from.start_period)}`, changed: (from.start ?? from.start_period) !== (to.start ?? to.start_period) },
                    { label: display(from.room ?? from.room_id), changed: (from.room ?? from.room_id) !== (to.room ?? to.room_id) },
                  ];
                  const toParts = [
                    { label: display(to.day), changed: from.day !== to.day },
                    { label: `P${display(to.start ?? to.start_period)}`, changed: (from.start ?? from.start_period) !== (to.start ?? to.start_period) },
                    { label: display(to.room ?? to.room_id), changed: (from.room ?? from.room_id) !== (to.room ?? to.room_id) },
                  ];
                  const changed = [
                    ...(from.day !== to.day ? ["day"] : []),
                    ...((from.start ?? from.start_period) !== (to.start ?? to.start_period) ? ["period"] : []),
                    ...((from.room ?? from.room_id) !== (to.room ?? to.room_id) ? ["room"] : []),
                  ];
                  return (
                    <TableRow key={`${String(session ?? "session")}-${index}`} className="h-11">
                      <TableCell className="font-mono text-xs">{display(session)}</TableCell>
                      <TableCell>{display(course)}</TableCell>
                      <TableCell>{fromParts.map((part, partIndex) => <span key={partIndex}>{partIndex ? " / " : ""}{part.changed ? <strong>{part.label}</strong> : part.label}</span>)}</TableCell>
                      <TableCell>{toParts.map((part, partIndex) => <span key={partIndex}>{partIndex ? " / " : ""}{part.changed ? <strong>{part.label}</strong> : part.label}</span>)}</TableCell>
                      <TableCell className="text-xs">{changed.length ? changed.join(", ") : "—"}</TableCell>
                    </TableRow>
                  );
                })}</TableBody>
              </Table>
            </div>
          ) : <p className="p-4 text-sm text-muted-foreground">No schedule differences are available.</p>}
        </CardContent>
      </Card>

      {change.originalText || change.disruption ? (
        <Card className="border border-border shadow-xs">
          <CardHeader><CardTitle>Original request</CardTitle><CardDescription>Submitted change details</CardDescription></CardHeader>
          <CardContent>
            {change.originalText ? <p className="whitespace-pre-wrap text-sm">{String(change.originalText)}</p> : <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{prettyJson(asRecord(change.disruption).request_metadata ?? change.disruption)}</pre>}
          </CardContent>
        </Card>
      ) : null}
      <Collapsible className="rounded-lg border bg-card p-4">
        <CollapsibleTrigger className="text-sm font-semibold">Repair report</CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{prettyJson(change.report ?? { message: "No report is available." })}</pre>
        </CollapsibleContent>
      </Collapsible>
      <Card className="border border-border shadow-xs">
        <CardHeader><CardTitle>Request information</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Requester</p><p className="mt-1 text-sm">{String(requester.name ?? "—")}</p></div>
          <div><p className="text-xs text-muted-foreground">Base timetable</p><p className="mt-1 break-all text-sm">{String(change.baseTimetableId ?? "—")}</p></div>
          <div><p className="text-xs text-muted-foreground">Created</p><p className="mt-1 text-sm">{formatDate(change.createdAt)}</p></div>
          {change.reviewNote ? <div><p className="text-xs text-muted-foreground">Review note</p><p className="mt-1 text-sm">{String(change.reviewNote)}</p></div> : null}
        </CardContent>
      </Card>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject change proposal</DialogTitle><DialogDescription>Enter the reason for rejecting this proposed timetable update.</DialogDescription></DialogHeader>
          <div className="space-y-2"><label htmlFor="reject-note" className="text-sm font-medium">Required note</label><Textarea id="reject-note" value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} maxLength={2000} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectNote.trim() || mutation.isPending} onClick={() => mutation.mutate("reject")}>Reject proposal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ChangeDetailPage() {
  return <RequireRole roles={["ADMIN", "COORDINATOR", "FACULTY", "CLUB"]}><Suspense fallback={<TableSkeleton rows={5} columns={4} />}><ChangeDetailContent /></Suspense></RequireRole>;
}
