"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, ShieldCheck } from "lucide-react";
import { ApiClientError, get, post } from "@/lib/api";
import { asArray, asRecord, formatDate, prettyJson } from "@/lib/admin-data";
import { BookingRequestForm } from "@/components/booking-request-form";
import { categoryLabel, isLabBooking, windowSummary } from "@/lib/bookings";
import { showApiError } from "@/lib/errors";
import { RequireRole } from "@/components/require-role";
import { ErrorState } from "@/components/error-state";
import { JobProgressDialog } from "@/components/job-progress-dialog";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton } from "@/components/table-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useMe } from "@/lib/session";

type BookingDetail = Record<string, unknown> & {
  id: string;
  externalId: string;
  title: string;
  status: string;
  requesterId: string | null;
  requesterName: string;
  requestedCategory: string;
  effectiveCategory: string;
  decisions: unknown[];
  currentDecision: Record<string, unknown> | null;
};

function slot(day: unknown, period: unknown, room?: unknown) {
  const place = [day, typeof period === "number" ? `P${period}` : null, room]
    .filter((value) => typeof value === "string" && value)
    .join(" · ");
  return place || "—";
}

function BookingDetailContent() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const { data: user } = useMe();
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [override, setOverride] = useState({
    status: "APPROVED",
    day: "MON",
    startPeriod: "1",
    endPeriod: "1",
    roomId: "",
    reason: "",
  });
  const [jobId, setJobId] = useState<string | null>(null);

  const booking = useQuery({
    queryKey: ["booking", id],
    queryFn: () => get<BookingDetail>(`/api/bookings/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["booking", id] }),
      client.invalidateQueries({ queryKey: ["bookings"] }),
    ]);
  };
  const mutation = useMutation({
    mutationFn: async (action: "cancel" | "decide" | "approve" | "reject" | "dept-approve" | "override") => {
      if (action === "cancel") {
        return post(`/api/bookings/${encodeURIComponent(id)}/cancel`, { note: cancelNote.trim() });
      }
      if (action === "decide") {
        return post<{ jobId: string }>(`/api/bookings/${encodeURIComponent(id)}/decide`);
      }
      const decisionId = String(booking.data?.currentDecision?.id ?? "");
      if (!decisionId) throw new Error("This booking has no current decision to review.");
      if (action === "approve") return post(`/api/bookings/decisions/${encodeURIComponent(decisionId)}/approve`);
      if (action === "reject") return post(`/api/bookings/decisions/${encodeURIComponent(decisionId)}/reject`, { reason: rejectReason.trim() });
      if (action === "dept-approve") return post(`/api/bookings/decisions/${encodeURIComponent(decisionId)}/dept-approve`);
      return post(`/api/bookings/${encodeURIComponent(id)}/override`, {
        status: override.status,
        day: override.day,
        startPeriod: Number(override.startPeriod),
        endPeriod: Number(override.endPeriod),
        roomId: override.roomId.trim(),
        reason: override.reason.trim(),
      });
    },
    onSuccess: async (result, action) => {
      if (action === "decide") {
        const job = asRecord(result);
        setJobId(typeof job.jobId === "string" ? job.jobId : null);
      }
      if (action === "cancel") setCancelOpen(false);
      if (action === "override") setOverrideOpen(false);
      if (action === "reject") setRejectOpen(false);
      await refresh();
    },
    onError: showApiError,
  });

  if (booking.isPending) return <TableSkeleton rows={5} columns={4} />;
  if (booking.isError) {
    return <ErrorState error={booking.error} onRetry={() => void booking.refetch()} />;
  }
  const request = booking.data;
  if (!request) return null;
  const decisions = [...asArray(request.decisions)].sort((left, right) => {
    const dateLeft = new Date(String(asRecord(left).createdAt ?? 0)).getTime();
    const dateRight = new Date(String(asRecord(right).createdAt ?? 0)).getTime();
    return dateRight - dateLeft;
  });
  const decision = request.currentDecision ?? decisions.find((item) => asRecord(item).isCurrent === true) as Record<string, unknown> | undefined;
  const overrides = asArray(decision?.overrides);
  const owner = Boolean(user?.id && user.id === request.requesterId);
  const admin = user?.role === "ADMIN";
  const coordinator = user?.role === "COORDINATOR";
  const submitted = request.status === "SUBMITTED";
  const pendingAdmin = decision?.approvalState === "PENDING_ADMIN";
  const canEditOrCancel = owner && submitted;
  const canDeptApprove =
    coordinator &&
    pendingAdmin &&
    !owner &&
    isLabBooking(request);

  const fields: Array<[string, unknown]> = [
    ["Requester", request.requesterName],
    ["Requester role", request.requesterRole],
    ["Title", request.title],
    ["Attendance", request.attendance],
    ["Duration", `${String(request.durationPeriods)} periods`],
    ["Requested windows", windowSummary(request.windows)],
    ["Room types", asArray(request.roomTypes).join(", ") || "—"],
    ["Needs", asArray(request.needs).join(", ") || "—"],
    ["Requested room", request.requestedRoom],
    ["Mandatory groups", asArray(request.mandatoryForGroups).join(", ") || "—"],
    ["Series ID", request.seriesId],
    ["Requested category", categoryLabel(request.requestedCategory)],
    ["Effective category", categoryLabel(request.effectiveCategory)],
    ["Submitted", formatDate(request.submittedAt)],
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button nativeButton={false} variant="link" size="sm" render={<Link href="/bookings" />}>
            <ArrowLeft aria-hidden="true" /> Bookings
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{request.externalId}</h1>
            <StatusBadge status={request.status} />
          </div>
          <p className="text-sm text-muted-foreground">{request.title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditOrCancel ? (
            <>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil aria-hidden="true" /> Edit
              </Button>
              <Button variant="outline" onClick={() => setCancelOpen(true)}>Cancel request</Button>
            </>
          ) : null}
          {admin && submitted ? (
            <>
              <Button onClick={() => mutation.mutate("decide")} disabled={mutation.isPending}>Decide this request</Button>
              {!owner ? <Button variant="outline" onClick={() => {
                setOverride({
                  status: "APPROVED",
                  day: "MON",
                  startPeriod: "1",
                  endPeriod: String(request.durationPeriods ?? 1),
                  roomId: String(request.requestedRoom ?? ""),
                  reason: "",
                });
                setOverrideOpen(true);
              }}>Override</Button> : null}
            </>
          ) : null}
          {admin && pendingAdmin && !owner ? (
            <>
              <Button onClick={() => mutation.mutate("approve")} disabled={mutation.isPending}>Approve</Button>
              <Button variant="outline" onClick={() => setRejectOpen(true)}>Reject</Button>
            </>
          ) : null}
          {canDeptApprove ? (
            <Button onClick={() => mutation.mutate("dept-approve")} disabled={mutation.isPending}>
              <ShieldCheck aria-hidden="true" /> Department approve
            </Button>
          ) : null}
        </div>
      </header>

      <Card className="border border-border shadow-xs">
        <CardHeader>
          <CardTitle>Request summary</CardTitle>
          <CardDescription>Submitted by {request.requesterName}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words text-sm">{value == null || value === "" ? "—" : String(value)}</dd>
              </div>
            ))}
            {typeof request.rawText === "string" && request.rawText ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs font-medium text-muted-foreground">Original description</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm">{request.rawText}</dd>
              </div>
            ) : null}
            {request.cancelNote ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs font-medium text-muted-foreground">Cancellation note</dt>
                <dd className="mt-1 text-sm">{String(request.cancelNote)}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card className="border border-border shadow-xs">
        <CardHeader><CardTitle>Current decision</CardTitle></CardHeader>
        <CardContent>
          {decision ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={String(decision.status ?? "SUBMITTED")} />
                {decision.approvalState ? <StatusBadge status={String(decision.approvalState)} /> : null}
              </div>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div><dt className="text-xs text-muted-foreground">Room</dt><dd className="mt-1 text-sm">{String(decision.roomId ?? "—")}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Day</dt><dd className="mt-1 text-sm">{String(decision.day ?? "—")}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Periods</dt><dd className="mt-1 text-sm">{decision.startPeriod && decision.endPeriod ? `${String(decision.startPeriod)}–${String(decision.endPeriod)}` : "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Source</dt><dd className="mt-1 text-sm">{String(decision.source ?? "—")}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Reason</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{String(decision.reason ?? "—")}</dd></div>
              </dl>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No decision has been recorded yet.</p>
          )}
        </CardContent>
      </Card>

      {overrides.length ? (
        <Card className="border border-border shadow-xs">
          <CardHeader><CardTitle>Session overrides</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent">
                <TableHead>Session</TableHead><TableHead>From slot</TableHead><TableHead>To slot</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {overrides.map((overrideItem, index) => {
                  const item = asRecord(overrideItem);
                  return (
                    <TableRow key={`${String(item.sessionId ?? "session")}-${index}`} className="h-11">
                      <TableCell>{String(item.sessionId ?? "—")}</TableCell>
                      <TableCell>{slot(item.fromDay, item.fromStart, item.fromRoom)}</TableCell>
                      <TableCell>{slot(item.toDay, item.toStart, item.toRoom)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border border-border shadow-xs">
        <CardHeader><CardTitle>Decision history</CardTitle></CardHeader>
        <CardContent>
          {decisions.length ? (
            <ol className="space-y-5">
              {decisions.map((raw, index) => {
                const item = asRecord(raw);
                return (
                  <li key={String(item.id ?? index)} className="relative pl-6">
                    <span className="absolute left-0 top-1.5 size-2.5 rounded-full border border-foreground bg-card" />
                    {index < decisions.length - 1 ? <span className="absolute bottom-[-18px] left-[4px] top-5 w-px bg-border" /> : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={String(item.status ?? "SUBMITTED")} />
                      {item.isCurrent ? <span className="text-xs text-muted-foreground">Current</span> : null}
                      <time className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</time>
                    </div>
                    <p className="mt-2 text-sm">{String(item.reason ?? "No reason recorded.")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {slot(item.day, item.startPeriod, item.roomId)} · {String(item.source ?? "—")} · Approval: {String(item.approvalState ?? "—")}
                    </p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No decisions are in the history yet.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit booking request</DialogTitle>
            <DialogDescription>Only submitted requests can be edited.</DialogDescription>
          </DialogHeader>
          <BookingRequestForm
            mode="edit"
            request={request}
            onComplete={async () => {
              setEditOpen(false);
              await refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel booking request</DialogTitle><DialogDescription>Provide a note explaining why this request is being cancelled.</DialogDescription></DialogHeader>
          <div className="space-y-2">
            <label htmlFor="cancel-note" className="text-sm font-medium">Cancellation note</label>
            <Textarea id="cancel-note" value={cancelNote} onChange={(event) => setCancelNote(event.target.value)} maxLength={2000} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep request</Button>
            <Button variant="destructive" disabled={!cancelNote.trim() || mutation.isPending} onClick={() => mutation.mutate("cancel")}>Cancel request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Override booking decision</DialogTitle><DialogDescription>The server revalidates the proposed placement against scheduling rules.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <Select value={override.status} onValueChange={(value) => value && setOverride({ ...override, status: value })}>
                <SelectTrigger aria-label="Decision status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["APPROVED", "ALTERNATIVE_OFFERED", "REJECTED"].map((status) => <SelectItem key={status} value={status}>{status.replaceAll("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><label htmlFor="override-day" className="text-sm font-medium">Day</label><Input id="override-day" value={override.day} onChange={(event) => setOverride({ ...override, day: event.target.value.toUpperCase() })} /></div>
            <div className="space-y-1.5"><label htmlFor="override-start" className="text-sm font-medium">Start period</label><Input id="override-start" type="number" min={1} value={override.startPeriod} onChange={(event) => setOverride({ ...override, startPeriod: event.target.value })} /></div>
            <div className="space-y-1.5"><label htmlFor="override-end" className="text-sm font-medium">End period</label><Input id="override-end" type="number" min={1} value={override.endPeriod} onChange={(event) => setOverride({ ...override, endPeriod: event.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><label htmlFor="override-room" className="text-sm font-medium">Room</label><Input id="override-room" value={override.roomId} onChange={(event) => setOverride({ ...override, roomId: event.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><label htmlFor="override-reason" className="text-sm font-medium">Reason</label><Textarea id="override-reason" value={override.reason} onChange={(event) => setOverride({ ...override, reason: event.target.value })} maxLength={2000} /></div>
          </div>
          {mutation.error instanceof ApiClientError && mutation.error.code === "SCHEDULE_RULE_VIOLATION" ? (
            <Alert variant="destructive">
              <AlertTitle>Placement violates a scheduling rule</AlertTitle>
              <AlertDescription><pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{prettyJson(mutation.error.details)}</pre></AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>Cancel</Button>
            <Button disabled={mutation.isPending || !override.roomId.trim() || !override.reason.trim()} onClick={() => mutation.mutate("override")}>Save override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject decision</DialogTitle><DialogDescription>Enter the review reason that will be recorded on this decision.</DialogDescription></DialogHeader>
          <div className="space-y-2">
            <label htmlFor="reject-reason" className="text-sm font-medium">Reason</label>
            <Textarea id="reject-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} maxLength={2000} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectReason.trim() || mutation.isPending} onClick={() => mutation.mutate("reject")}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <JobProgressDialog
        jobId={jobId}
        onSuccess={() => {
          setJobId(null);
          void refresh();
        }}
        onClose={() => setJobId(null)}
      />
    </div>
  );
}

export default function BookingDetailPage() {
  return (
    <RequireRole roles={["ADMIN", "COORDINATOR", "FACULTY", "CLUB"]}>
      <Suspense fallback={<TableSkeleton rows={5} columns={4} />}>
        <BookingDetailContent />
      </Suspense>
    </RequireRole>
  );
}
