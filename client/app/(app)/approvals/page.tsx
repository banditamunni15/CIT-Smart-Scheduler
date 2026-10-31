"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BellRing, ClipboardCheck } from "lucide-react";
import { get } from "@/lib/api";
import { asArray, asRecord, formatDate } from "@/lib/admin-data";
import { isLabBooking } from "@/lib/bookings";
import { useMe } from "@/lib/session";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { RequireRole } from "@/components/require-role";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton } from "@/components/table-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Booking = {
  id: string;
  externalId: string;
  title: string;
  requesterName: string;
  roomTypes: string[];
  status: string;
  createdAt: string;
  currentDecision: {
    id: string;
    approvalState: string;
  } | null;
};

type ChangeProposal = {
  id: string;
  source: string;
  status: string;
  createdAt: string;
  requestedBy?: {
    name?: string;
  } | null;
};

type PageData<T> = {
  items: T[];
  total: number;
};

function BookingApprovals() {
  const { data: user } = useMe();
  const isCoordinator = user?.role === "COORDINATOR";
  const query = useQuery({
    queryKey: ["approvals", "bookings"],
    queryFn: () =>
      get<PageData<Booking>>("/api/bookings?status=SUBMITTED&page=1&limit=100"),
  });

  if (query.isPending) return <TableSkeleton rows={3} columns={5} />;
  if (query.isError) {
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    );
  }

  const bookings = asArray(query.data.items).filter((raw) => {
    const booking = asRecord(raw) as Booking;
    const approvalState = booking.currentDecision?.approvalState;
    if (isCoordinator) {
      return approvalState === "PENDING_ADMIN" && isLabBooking(booking);
    }
    return approvalState === "PENDING_ADMIN" || approvalState === "DEPT_APPROVED";
  });

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        description="There are no booking decisions waiting for your approval."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Request</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Requester</TableHead>
            <TableHead>Approval</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((raw) => {
            const booking = asRecord(raw) as Booking;
            const approvalState =
              booking.currentDecision?.approvalState ?? "PENDING_ADMIN";
            return (
              <TableRow key={booking.id} className="h-11">
                <TableCell className="font-mono text-xs">
                  {booking.externalId}
                </TableCell>
                <TableCell className="max-w-56 truncate font-medium">
                  {booking.title}
                </TableCell>
                <TableCell>{booking.requesterName}</TableCell>
                <TableCell>
                  <StatusBadge status={approvalState} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(booking.createdAt)}
                </TableCell>
                <TableCell>
                  <Button
                    nativeButton={false}
                    variant="link"
                    size="sm"
                    render={
                      <Link href={`/bookings/${encodeURIComponent(booking.id)}`} />
                    }
                  >
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ChangeApprovals() {
  const { data: user } = useMe();
  const statusFilter =
    user?.role === "ADMIN" ? "PROPOSED,DEPT_APPROVED" : "PROPOSED";
  const query = useQuery({
    queryKey: ["approvals", "changes", statusFilter],
    queryFn: () =>
      get<ChangeProposal[]>(
        `/api/changes?status=${encodeURIComponent(statusFilter)}`,
      ),
  });

  if (query.isPending) return <TableSkeleton rows={3} columns={5} />;
  if (query.isError) {
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    );
  }

  const proposals = asArray(query.data);
  if (proposals.length === 0) {
    return (
      <EmptyState
        icon={BellRing}
        description="There are no timetable changes waiting for your approval."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Change</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Requester</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {proposals.map((raw) => {
            const proposal = asRecord(raw) as ChangeProposal;
            return (
              <TableRow key={proposal.id} className="h-11">
                <TableCell className="max-w-40 truncate font-mono text-xs">
                  {proposal.id}
                </TableCell>
                <TableCell>
                  {proposal.source.replaceAll("_", " ").toLowerCase()}
                </TableCell>
                <TableCell>
                  {String(asRecord(proposal.requestedBy).name ?? "—")}
                </TableCell>
                <TableCell>
                  <StatusBadge status={proposal.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(proposal.createdAt)}
                </TableCell>
                <TableCell>
                  <Button
                    nativeButton={false}
                    variant="link"
                    size="sm"
                    render={
                      <Link href={`/changes/${encodeURIComponent(proposal.id)}`} />
                    }
                  >
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ApprovalsContent() {
  const { data: user } = useMe();
  const role = user?.role === "ADMIN" ? "Admin" : "Department";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review booking decisions and timetable changes awaiting {role.toLowerCase()} approval.
        </p>
      </header>
      <section aria-labelledby="booking-approvals-heading" className="space-y-3">
        <div>
          <h2
            id="booking-approvals-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Booking decisions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pending lab bookings for your department and decisions awaiting Admin review.
          </p>
        </div>
        <Card>
          <CardContent className="p-0">
            <BookingApprovals />
          </CardContent>
        </Card>
      </section>
      <section aria-labelledby="change-approvals-heading" className="space-y-3">
        <div>
          <h2
            id="change-approvals-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Timetable changes
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Faculty proposals for department review and changes awaiting Admin approval.
          </p>
        </div>
        <Card>
          <CardContent className="p-0">
            <ChangeApprovals />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <RequireRole roles={["ADMIN", "COORDINATOR"]}>
      <ApprovalsContent />
    </RequireRole>
  );
}
