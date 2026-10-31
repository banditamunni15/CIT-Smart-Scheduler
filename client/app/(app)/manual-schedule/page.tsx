"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import { ApiClientError, get, post } from "@/lib/api";
import { asArray, asRecord, prettyJson } from "@/lib/admin-data";
import { normalizeEntry } from "@/lib/timetable-adapter";
import { RequireRole } from "@/components/require-role";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { TableSkeleton } from "@/components/table-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const days = ["MON", "TUE", "WED", "THU", "FRI"] as const;
const periods = [1, 2, 3, 4, 5, 6, 7, 8, 9];

type Placement = { session_id: string; day: string; start_period: number; room_id: string };

function ManualScheduleContent() {
  const [sessionId, setSessionId] = useState("");
  const [day, setDay] = useState("MON");
  const [period, setPeriod] = useState("1");
  const [roomId, setRoomId] = useState("");
  const [validation, setValidation] = useState<{ ok: boolean; report?: unknown; error?: unknown } | null>(null);
  const timetable = useQuery({
    queryKey: ["manual-schedule", "published"],
    queryFn: () => get<unknown>("/api/timetables/published"),
  });
  const schedule = asRecord(asRecord(timetable.data).schedule);
  const placements = asArray(schedule.sessions);
  const sessions = placements.map((raw) => {
    const placement = asRecord(raw);
    const sessionId = String(placement.session_id ?? placement.id ?? "");
    const entry = normalizeEntry({ ...placement, id: sessionId });
    return { id: sessionId, entry, placement: placement as Placement };
  }).filter((item) => item.id);
  const chosenSession = sessions.find((session) => session.id === sessionId) ?? sessions[0];
  const freeRooms = useQuery({
    queryKey: ["manual-schedule", "free-rooms", day, period],
    queryFn: () => get<unknown>(`/api/public/free-rooms?day=${day}&period=${period}`),
    enabled: Boolean(day && period),
  });
  const freeRoomOptions = asArray(freeRooms.data).map((raw) => {
    const room = asRecord(raw);
    const id = String(room.room_id ?? room.id ?? "");
    return { id, label: String(room.name ?? room.label ?? id) };
  }).filter((room) => room.id);
  const scheduledRooms = placements.map((raw) => {
    const id = String(asRecord(raw).room_id ?? "");
    return id ? { id, label: id } : null;
  }).filter((room): room is { id: string; label: string } => room !== null);
  const rooms = [...new Map([...freeRoomOptions, ...scheduledRooms].map((room) => [room.id, room])).values()];
  const check = async () => {
    setValidation(null);
    if (!chosenSession) {
      setValidation({ ok: false, error: "Select a session." });
      return;
    }
    if (!roomId) {
      setValidation({ ok: false, error: "Select a room." });
      return;
    }
    const nextSchedule = {
      ...schedule,
      sessions: placements.map((raw) => {
        const placement = asRecord(raw);
        if (String(placement.session_id ?? placement.id ?? "") !== chosenSession.id) return raw;
        return {
          ...placement,
          session_id: chosenSession.id,
          day,
          start_period: Number(period),
          room_id: roomId,
        };
      }),
    };
    try {
      const report = await post<unknown>("/api/timetables/manual/validate", { schedule: nextSchedule });
      setValidation({ ok: true, report });
    } catch (error) {
      setValidation({ ok: false, error: error instanceof ApiClientError ? error.details ?? error.message : error });
    }
  };

  if (timetable.isPending) return <TableSkeleton rows={5} columns={3} />;
  if (timetable.isError) return <ErrorState error={timetable.error} onRetry={() => void timetable.refetch()} />;
  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-semibold tracking-tight">Manual schedule</h1><p className="mt-1 text-sm text-muted-foreground">Validate a proposed placement against the published timetable. This check does not save changes.</p></header>
      {!sessions.length ? <EmptyState icon={CalendarCheck} description="The published timetable has no sessions to place." /> : (
        <Card className="border border-border shadow-xs">
          <CardHeader><CardTitle>Check a placement</CardTitle><CardDescription>Choose a session, day, period, and room. Nothing is saved by this validation.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Select value={chosenSession?.id ?? null} onValueChange={(value) => { if (value) { setSessionId(value); setValidation(null); } }}>
              <SelectTrigger aria-label="Session"><SelectValue placeholder="Select session" /></SelectTrigger>
              <SelectContent>{sessions.map(({ id, entry }) => <SelectItem key={id} value={id}>{entry.courseId} · {id} · {entry.day} P{entry.startPeriod}</SelectItem>)}</SelectContent>
            </Select>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select value={day} onValueChange={(value) => { if (value) { setDay(value); setRoomId(""); setValidation(null); } }}>
                <SelectTrigger aria-label="Day"><SelectValue /></SelectTrigger><SelectContent>{days.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={period} onValueChange={(value) => { if (value) { setPeriod(value); setRoomId(""); setValidation(null); } }}>
                <SelectTrigger aria-label="Start period"><SelectValue /></SelectTrigger><SelectContent>{periods.map((value) => <SelectItem key={value} value={String(value)}>Period {value}</SelectItem>)}</SelectContent>
              </Select>
              {freeRooms.isError ? <ErrorState error={freeRooms.error} onRetry={() => void freeRooms.refetch()} /> : (
                <Select value={roomId || null} onValueChange={(value) => { if (value) { setRoomId(value); setValidation(null); } }}>
                  <SelectTrigger aria-label="Room"><SelectValue placeholder={freeRooms.isPending ? "Loading rooms…" : "Select room"} /></SelectTrigger>
                  <SelectContent>{rooms.map((room) => <SelectItem key={room.id} value={room.id}>{room.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            {validation ? validation.ok ? (
              <Alert><AlertTitle>Valid</AlertTitle><AlertDescription>The proposed placement passed the scheduling rule check. No timetable changes have been saved.</AlertDescription></Alert>
            ) : (
              <Alert variant="destructive">              <AlertTitle>Placement violates scheduling rules</AlertTitle><AlertDescription>
                {asArray(asRecord(validation.error).violations).length ? (
                  <ul className="list-disc space-y-1 pl-5">{asArray(asRecord(validation.error).violations).map((violation, index) => <li key={index}>{typeof violation === "string" ? violation : prettyJson(violation)}</li>)}</ul>
                ) : <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{prettyJson(validation.error)}</pre>}
              </AlertDescription></Alert>
            ) : null}
            <Button onClick={() => void check()} disabled={!chosenSession || !roomId || freeRooms.isPending}>Check placement</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ManualSchedulePage() {
  return <RequireRole roles={["ADMIN", "COORDINATOR"]}><ManualScheduleContent /></RequireRole>;
}
