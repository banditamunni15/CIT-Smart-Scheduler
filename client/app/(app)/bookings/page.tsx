"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronDown, Plus, WandSparkles } from "lucide-react";
import { get, post } from "@/lib/api";
import { asArray, asRecord } from "@/lib/admin-data";
import {
  categoryLabel,
  currentDecision,
  windowSummary,
} from "@/lib/bookings";
import { RequireRole } from "@/components/require-role";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { JobProgressDialog } from "@/components/job-progress-dialog";
import { PaginationBar } from "@/components/pagination-bar";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton } from "@/components/table-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMe } from "@/lib/session";

type Booking = Record<string, unknown> & {
  id: string;
  externalId: string;
  title: string;
  requesterName: string;
  requestedCategory: string;
  effectiveCategory: string;
  status: string;
  seriesId?: string | null;
};
type PageData<T> = { items: T[]; total: number; page: number; limit: number };

function BookingTableRow({
  booking,
}: {
  booking: Booking;
}) {
  const [open, setOpen] = useState(false);
  const siblings = useQuery({
    queryKey: ["bookings", "series", booking.seriesId],
    queryFn: () => get<unknown[]>(`/api/bookings/series/${encodeURIComponent(booking.seriesId ?? "")}`),
    enabled: open && Boolean(booking.seriesId),
  });
  const siblingItems = asArray(siblings.data).map((value) => asRecord(value));
  const hasSeries = Boolean(booking.seriesId);
  const decision = currentDecision(booking);
  const reason = typeof decision?.reason === "string" ? decision.reason : "—";
  const requester =
      typeof booking.requesterName === "string"
        ? booking.requesterName
        : String(asRecord(booking.requester).name ?? "—");

  return (
      <TableRow key={booking.id} className="h-11">
        <TableCell className="font-mono text-xs">
          <Link className="hover:underline" href={`/bookings/${encodeURIComponent(booking.id)}`}>
            {booking.externalId}
          </Link>
        </TableCell>
        <TableCell className="max-w-56 truncate font-medium">{booking.title}</TableCell>
        <TableCell>{requester}</TableCell>
        <TableCell>
          <span>{categoryLabel(booking.effectiveCategory)}</span>
          {booking.requestedCategory !== booking.effectiveCategory ? (
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              capped to {categoryLabel(booking.effectiveCategory).toLowerCase()}
            </span>
          ) : null}
        </TableCell>
        <TableCell className="max-w-48 truncate text-xs text-muted-foreground" title={windowSummary(booking.windows)}>
          {windowSummary(booking.windows)}
        </TableCell>
        <TableCell><StatusBadge status={booking.status} /></TableCell>
        <TableCell className="max-w-52">
          <Tooltip>
            <TooltipTrigger className="block max-w-full truncate text-left text-xs text-muted-foreground">
              {reason}
            </TooltipTrigger>
            <TooltipContent className="whitespace-pre-wrap">{reason}</TooltipContent>
          </Tooltip>
        </TableCell>
        <TableCell className="text-right">
          {hasSeries ? (
            <Collapsible
              open={open}
              onOpenChange={setOpen}
            >
              <CollapsibleTrigger
                aria-label={`Show siblings in series ${booking.seriesId}`}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                <ChevronDown className="size-3" />
              </CollapsibleTrigger>
              <CollapsibleContent className="absolute right-5 z-20 mt-1 max-h-56 w-64 overflow-auto rounded-md border bg-card p-2 text-left shadow-xs">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  Series siblings
                </p>
                {siblings.isPending ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">Loading series…</p>
                ) : siblings.isError ? (
                  <p className="px-2 py-2 text-xs text-destructive">Could not load this series. Reopen to retry.</p>
                ) : siblingItems.filter((sibling) => sibling.id !== booking.id).map((sibling) => (
                  <Link
                    key={String(sibling.id)}
                    href={`/bookings/${encodeURIComponent(String(sibling.id))}`}
                    className="block rounded px-2 py-2 text-xs hover:bg-muted"
                  >
                    <span className="font-mono">{String(sibling.externalId ?? sibling.id)}</span>
                    <span className="ml-2">{String(sibling.title ?? "Booking")}</span>
                  </Link>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ) : <span className="text-xs text-muted-foreground">—</span>}
        </TableCell>
      </TableRow>
  );
}

function BookingTable({ bookings }: { bookings: Booking[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {["ID", "Title", "Requester", "Category", "Windows", "Status", "Current reason", "Series"].map((heading) => (
              <TableHead key={heading} className="text-[11px] uppercase tracking-wide text-muted-foreground">{heading}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((booking) => (
            <BookingTableRow key={booking.id} booking={booking} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BookingsContent() {
  const client = useQueryClient();
  const { data: user } = useMe();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [seriesId, setSeriesId] = useState("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const seriesQuery = useQuery({
    queryKey: ["bookings", "series-options"],
    queryFn: () => get<unknown[]>("/api/bookings?limit=100"),
  });
  const seriesItems = useMemo(() => {
    const data = seriesQuery.data;
    const items = asArray(asRecord(data).items);
    return [...new Set(items
      .map((item) => asRecord(item).seriesId)
      .filter((value): value is string => typeof value === "string" && Boolean(value)))];
  }, [seriesQuery.data]);

  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (status !== "ALL") params.set("status", status);
  if (category !== "ALL") params.set("category", category);
  if (seriesId !== "ALL") params.set("seriesId", seriesId);
  if (debouncedSearch) params.set("q", debouncedSearch);
  const bookings = useQuery({
    queryKey: ["bookings", "list", page, status, category, seriesId, debouncedSearch],
    queryFn: () => get<PageData<Booking>>(`/api/bookings?${params}`),
  });
  const decideAll = useMutation({
    mutationFn: () => post<{ jobId: string }>("/api/bookings/decide"),
    onSuccess: ({ jobId: nextJobId }) => setJobId(nextJobId),
  });

  const jobSuccess = () => {
    setJobId(null);
    void client.invalidateQueries({ queryKey: ["bookings"] });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse and manage room and event requests.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user?.role === "ADMIN" ? (
            <Button variant="outline" disabled={decideAll.isPending} onClick={() => decideAll.mutate()}>
              <WandSparkles aria-hidden="true" />
              {decideAll.isPending ? "Queueing…" : "Decide all"}
            </Button>
          ) : null}
          <Button nativeButton={false} render={<Link href="/bookings/new" />}>
            <Plus aria-hidden="true" /> New request
          </Button>
        </div>
      </header>

      {decideAll.isError ? <ErrorState error={decideAll.error} onRetry={() => decideAll.mutate()} /> : null}

      <Card className="border border-border shadow-xs">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            aria-label="Search booking titles"
            placeholder="Search title"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
          <Select value={status} onValueChange={(value) => {
            if (!value) return;
            setPage(1);
            setStatus(value);
          }}>
            <SelectTrigger aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {["SUBMITTED", "APPROVED", "ALTERNATIVE_OFFERED", "REJECTED", "CANCELLED"].map((item) => (
                <SelectItem key={item} value={item}>{item.replaceAll("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(value) => {
            if (!value) return;
            setPage(1);
            setCategory(value);
          }}>
            <SelectTrigger aria-label="Filter by category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All categories</SelectItem>
              {["INSTITUTE_EVENT", "GUEST_LECTURE", "DEPARTMENT_EVENT", "CLUB_EVENT"].map((item) => (
                <SelectItem key={item} value={item}>{categoryLabel(item)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={seriesId} onValueChange={(value) => {
            if (!value) return;
            setPage(1);
            setSeriesId(value);
          }}>
            <SelectTrigger aria-label="Filter by series"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All series</SelectItem>
              {seriesItems.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="border border-border shadow-xs">
        <CardContent className="p-0">
          {bookings.isPending ? (
            <div className="p-4"><TableSkeleton rows={6} columns={8} /></div>
          ) : bookings.isError ? (
            <div className="p-4"><ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} /></div>
          ) : bookings.data.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={CalendarClock}
                description="No booking requests match these filters."
                action={<Button nativeButton={false} render={<Link href="/bookings/new" />}>New request</Button>}
              />
            </div>
          ) : (
            <>
              <BookingTable bookings={bookings.data.items} />
              <PaginationBar data={bookings.data} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
      <JobProgressDialog
        jobId={jobId}
        onSuccess={jobSuccess}
        onClose={() => setJobId(null)}
      />
    </div>
  );
}

export default function BookingsPage() {
  return <RequireRole roles={["ADMIN", "COORDINATOR", "FACULTY", "CLUB"]}><BookingsContent /></RequireRole>;
}
