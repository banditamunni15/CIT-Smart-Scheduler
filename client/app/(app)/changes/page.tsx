"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Plus } from "lucide-react";
import { get } from "@/lib/api";
import { asArray, asRecord, formatDate } from "@/lib/admin-data";
import { useMe } from "@/lib/session";
import { RequireRole } from "@/components/require-role";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
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

type ChangeRecord = Record<string, unknown> & {
  id: string;
  source: string;
  status: string;
  createdAt: string;
};

const filters = [
  { value: "ALL", label: "All" },
  { value: "PROPOSED,DEPT_APPROVED", label: "Waiting for my OK" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "PROPOSED", label: "Proposed" },
  { value: "DEPT_APPROVED", label: "Dept approved" },
  { value: "APPROVED", label: "Approved" },
  { value: "IMPOSSIBLE", label: "Impossible" },
  { value: "REJECTED,WITHDRAWN", label: "Closed" },
];

function ChangesContent() {
  const { data: user } = useMe();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const effectiveFilter = statusFilter ?? (user?.role === "ADMIN" ? "PROPOSED,DEPT_APPROVED" : "ALL");
  const query = useQuery({
    queryKey: ["changes", effectiveFilter],
    queryFn: () =>
      get<ChangeRecord[]>(
        `/api/changes${effectiveFilter === "ALL" ? "" : `?status=${encodeURIComponent(effectiveFilter)}`}`,
      ),
  });
  const changes = useMemo(() => asArray(query.data), [query.data]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Changes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review timetable repair proposals and requests.
          </p>
        </div>
        {user?.role !== "CLUB" ? (
          <Button nativeButton={false} render={<Link href="/changes/new" />}>
            <Plus aria-hidden="true" /> New change
          </Button>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2" aria-label="Filter changes by status">
        {filters.map((filter) => (
          <Button
            key={filter.value}
            variant={effectiveFilter === filter.value ? "default" : "outline"}
            size="sm"
            aria-pressed={effectiveFilter === filter.value}
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <Card className="border border-border shadow-xs">
        <CardContent className="p-0">
          {query.isPending ? (
            <div className="p-4"><TableSkeleton rows={6} columns={5} /></div>
          ) : query.isError ? (
            <div className="p-4"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div>
          ) : changes.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={BellRing}
                description="There are no change proposals in this view."
                action={user?.role !== "CLUB" ? <Button nativeButton={false} render={<Link href="/changes/new" />}>New change</Button> : undefined}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {["Source", "Requester", "Status", "Moved", "Created"].map((heading) => (
                      <TableHead key={heading} className="text-[11px] uppercase tracking-wide text-muted-foreground">{heading}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changes.map((raw) => {
                    const change = asRecord(raw) as ChangeRecord;
                    const requester = asRecord(change.requestedBy);
                    return (
                      <TableRow key={change.id} className="h-11">
                        <TableCell>
                          <Link href={`/changes/${encodeURIComponent(change.id)}`} className="font-medium hover:underline">
                            {change.source.replaceAll("_", " ")}
                          </Link>
                        </TableCell>
                        <TableCell>{String(requester.name ?? "—")}</TableCell>
                        <TableCell><StatusBadge status={change.status} /></TableCell>
                        <TableCell>{typeof change.movedCount === "number" ? change.movedCount : "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(change.createdAt)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ChangesPage() {
  return <RequireRole roles={["ADMIN", "COORDINATOR", "FACULTY", "CLUB"]}><ChangesContent /></RequireRole>;
}
