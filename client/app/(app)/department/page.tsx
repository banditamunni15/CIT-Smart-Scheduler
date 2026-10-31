"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ClipboardList } from "lucide-react";
import { get } from "@/lib/api";
import { asArray, asRecord } from "@/lib/admin-data";
import { normalizeEntry, type TimetableEntry } from "@/lib/timetable-adapter";
import { useMe } from "@/lib/session";
import { RequireRole } from "@/components/require-role";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton } from "@/components/table-skeleton";
import { TimetableGrid } from "@/components/timetable-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DeptOption = { id: string; label: string };
type DeptData = { groups: DeptOption[]; faculty: DeptOption[]; entries: TimetableEntry[] };

function DepartmentContent() {
  const { data: user } = useMe();
  const [viewType, setViewType] = useState<"faculty" | "group">("faculty");
  const [selectedId, setSelectedId] = useState("");
  const [bookingPage, setBookingPage] = useState(1);
  const department = user?.department ?? null;
  const departmentData = useQuery({
    queryKey: ["department", "timetable-options", department],
    queryFn: async (): Promise<DeptData> => {
      const rawGroups = asArray(await get<unknown>("/api/public/groups"));
      const groups = rawGroups.filter((raw) => {
        const row = asRecord(raw);
        return Boolean(department) && String(row.department ?? row.department_id ?? "") === department;
      }).map((raw) => {
        const row = asRecord(raw);
        const id = String(row.group_id ?? row.id ?? "");
        return { id, label: String(row.name ?? row.label ?? id) };
      }).filter((group) => group.id);
      const views = await Promise.all(groups.map(async ({ id }) =>
        asArray(await get<unknown>(`/api/timetables/views/group/${encodeURIComponent(id)}`)),
      ));
      const entries = views.flatMap((rows) => rows).map(normalizeEntry);
      const facultyIds = [...new Set(entries.flatMap((entry) => entry.faculty))];
      return {
        groups,
        faculty: facultyIds.map((id) => ({ id, label: id })),
        entries,
      };
    },
  });
  const options = useMemo(() => viewType === "group" ? departmentData.data?.groups ?? [] : departmentData.data?.faculty ?? [], [departmentData.data, viewType]);
  const selected = selectedId || options[0]?.id || "";
  const filtered = useMemo(() => (departmentData.data?.entries ?? []).filter((entry) =>
    viewType === "group" ? entry.groups.includes(selected) : entry.faculty.includes(selected),
  ), [departmentData.data, selected, viewType]);
  const bookings = useQuery({
    queryKey: ["department", "bookings", bookingPage],
    queryFn: () => get<{ items: unknown[]; total: number; page: number; limit: number }>(`/api/bookings?page=${bookingPage}&limit=20`),
  });

  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-semibold tracking-tight">Department</h1><p className="mt-1 text-sm text-muted-foreground">Department timetable, booking requests, and approvals.</p></header>
      <Tabs defaultValue="timetable">
        <TabsList><TabsTrigger value="timetable">Timetable</TabsTrigger><TabsTrigger value="requests">Requests</TabsTrigger><TabsTrigger value="approvals">Approvals</TabsTrigger></TabsList>
        <TabsContent value="timetable" className="mt-5 space-y-4">
          <Card className="border border-border shadow-xs"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
            <Select value={viewType} onValueChange={(value) => { if (value === "faculty" || value === "group") { setViewType(value); setSelectedId(""); } }}>
              <SelectTrigger aria-label="View timetable by"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="faculty">Faculty</SelectItem><SelectItem value="group">Group</SelectItem></SelectContent>
            </Select>
            {departmentData.isPending ? <div className="flex-1"><TableSkeleton rows={1} columns={1} /></div> : departmentData.isError ? null : (
              <Select value={selected || null} onValueChange={(value) => value && setSelectedId(value)}>
                <SelectTrigger aria-label={viewType === "faculty" ? "Select faculty" : "Select group"}><SelectValue placeholder={viewType === "faculty" ? "Select faculty" : "Select group"} /></SelectTrigger>
                <SelectContent>{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </CardContent></Card>
          {departmentData.isPending ? <TableSkeleton rows={8} columns={6} /> : departmentData.isError ? <ErrorState error={departmentData.error} onRetry={() => void departmentData.refetch()} /> : filtered.length ? <TimetableGrid entries={filtered} mode={viewType} /> : <EmptyState icon={CalendarDays} description="No published sessions are available for this department selection." />}
        </TabsContent>
        <TabsContent value="requests" className="mt-5">
          <Card className="border border-border shadow-xs"><CardContent className="p-0">
            {bookings.isPending ? <div className="p-4"><TableSkeleton rows={5} columns={5} /></div> : bookings.isError ? <div className="p-4"><ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} /></div> : asArray(bookings.data.items).length === 0 ? <div className="p-4"><EmptyState icon={ClipboardList} description="There are no department booking requests." /></div> : (
              <>
                <div className="overflow-x-auto"><Table><TableHeader><TableRow className="hover:bg-transparent"><TableHead>ID</TableHead><TableHead>Title</TableHead><TableHead>Requester</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{asArray(bookings.data.items).map((raw) => {
                  const booking = asRecord(raw);
                  return <TableRow key={String(booking.id)} className="h-11"><TableCell className="font-mono text-xs">{String(booking.externalId ?? booking.id)}</TableCell><TableCell>{String(booking.title ?? "—")}</TableCell><TableCell>{String(booking.requesterName ?? "—")}</TableCell><TableCell><StatusBadge status={String(booking.status ?? "SUBMITTED")} /></TableCell><TableCell><Button nativeButton={false} variant="link" size="sm" render={<Link href={`/bookings/${encodeURIComponent(String(booking.id))}`} />}>View</Button></TableCell></TableRow>;
                })}</TableBody></Table></div>
                {bookings.data.total > bookings.data.limit ? <div className="flex items-center justify-between border-t p-3 text-sm"><span>Page {bookings.data.page} of {Math.ceil(bookings.data.total / bookings.data.limit)}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={bookingPage <= 1} onClick={() => setBookingPage((page) => page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={bookingPage * bookings.data.limit >= bookings.data.total} onClick={() => setBookingPage((page) => page + 1)}>Next</Button></div></div> : null}
              </>
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="approvals" className="mt-5"><Card className="border border-border shadow-xs"><CardContent className="flex items-center justify-between gap-4 p-5"><div><h2 className="font-semibold">Department approvals</h2><p className="mt-1 text-sm text-muted-foreground">Review lab booking and timetable change approvals.</p></div><Button nativeButton={false} render={<Link href="/approvals" />}>Open approvals</Button></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}

export default function DepartmentPage() {
  return <RequireRole roles={["COORDINATOR"]}><DepartmentContent /></RequireRole>;
}
