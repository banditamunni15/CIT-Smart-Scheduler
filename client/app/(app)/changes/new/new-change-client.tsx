"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { API_URL, ApiClientError, get, post } from "@/lib/api";
import { asArray, asRecord } from "@/lib/admin-data";
import { normalizeEntry } from "@/lib/timetable-adapter";
import { useMe } from "@/lib/session";
import { RequireRole } from "@/components/require-role";
import { ErrorState } from "@/components/error-state";
import { JobProgressDialog } from "@/components/job-progress-dialog";
import { TableSkeleton } from "@/components/table-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TimetableEntry } from "@/lib/timetable-adapter";

const days = ["MON", "TUE", "WED", "THU", "FRI"] as const;
type ChangeKind = "faculty_unavailable" | "room_unavailable" | "add_session" | "add_faculty" | "remove_session";
type DisruptionRow = {
  type: ChangeKind;
  id: string;
  target: string;
  days: string[];
  periods: string;
  reason: string;
  json: string;
};

const newRow = (): DisruptionRow => ({
  type: "faculty_unavailable",
  id: crypto.randomUUID(),
  target: "",
  days: [],
  periods: "",
  reason: "",
  json: "{\n  \n}",
});

function parseJsonObject(source: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function makeDisruption(rows: DisruptionRow[]) {
  if (!rows.length) throw new Error("Add at least one disruption before submitting.");
  const changes = rows.map((row, index) => {
    if (row.type === "faculty_unavailable" || row.type === "room_unavailable") {
      if (!row.target.trim()) throw new Error(`Row ${index + 1}: enter an ID.`);
      if (!row.days.length) throw new Error(`Row ${index + 1}: select at least one day.`);
      if (!row.reason.trim()) throw new Error(`Row ${index + 1}: enter a reason.`);
      const periods = row.periods.trim()
        ? row.periods.split(",").map((value) => Number(value.trim()))
        : undefined;
      if (periods?.some((value) => !Number.isInteger(value) || value < 1)) {
        throw new Error(`Row ${index + 1}: periods must be positive integers separated by commas.`);
      }
      return row.type === "faculty_unavailable"
        ? { type: row.type, faculty_id: row.target.trim(), days: row.days, ...(periods ? { periods } : {}), reason: row.reason.trim() }
        : { type: row.type, room_id: row.target.trim(), days: row.days, ...(periods ? { periods } : {}), reason: row.reason.trim() };
    }
    if (row.type === "remove_session") {
      if (!row.target.trim()) throw new Error(`Row ${index + 1}: enter a session ID.`);
      return { type: row.type, session_id: row.target.trim() };
    }
    return row.type === "add_session"
      ? { type: row.type, session: parseJsonObject(row.json, `Row ${index + 1} session`) }
      : { type: row.type, faculty: parseJsonObject(row.json, `Row ${index + 1} faculty`) };
  });
  return { changes };
}

function AdminDisruptionBuilder({ onCreated }: { onCreated: (jobId: string, changeId: string) => void }) {
  const [rows, setRows] = useState<DisruptionRow[]>([newRow()]);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState("");
  const [errorText, setErrorText] = useState("");
  const [fileError, setFileError] = useState("");

  const mutation = useMutation({
    mutationFn: (body: { changes: unknown[] }) => post<{ jobId: string; changeId: string }>("/api/changes", body),
    onSuccess: (result) => onCreated(result.jobId, result.changeId),
    onError: (error) => {
      setErrorText(error instanceof Error ? error.message : "The change could not be submitted.");
    },
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a JSON file first.");
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API_URL}/api/changes/upload`, {
        method: "POST",
        credentials: "include",
        body,
      });
      const envelope = await response.json() as { success?: boolean; statusCode?: number; message?: string; code?: string; details?: unknown; data?: { jobId: string; changeId: string } };
      if (!response.ok || envelope.success !== true || !envelope.data) {
        throw new ApiClientError(
          envelope.statusCode ?? response.status,
          envelope.code ?? "REQUEST_FAILED",
          envelope.message ?? "The file could not be submitted.",
          envelope.details,
        );
      }
      return envelope.data;
    },
    onSuccess: (result) => onCreated(result.jobId, result.changeId),
    onError: (error) => setFileError(error instanceof Error ? error.message : "The file could not be submitted."),
  });

  const updateRow = (id: string, patch: Partial<DisruptionRow>) =>
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const validateAndSubmit = () => {
    setErrorText("");
    try {
      mutation.mutate(makeDisruption(rows));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Check the disruption fields.");
    }
  };
  const previewUpload = async (nextFile: File | undefined) => {
    setFile(nextFile ?? null);
    setFilePreview("");
    setFileError("");
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".json")) {
      setFileError("Choose a .json file.");
      return;
    }
    try {
      const text = await nextFile.text();
      const parsed = JSON.parse(text) as unknown;
      const parsedChanges = asRecord(parsed).changes;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsedChanges) || !parsedChanges.length) {
        throw new Error('The JSON file must contain a non-empty "changes" array.');
      }
      setFilePreview(JSON.stringify(parsed, null, 2));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "The file must contain valid JSON.");
    }
  };

  return (
    <Tabs defaultValue="form">
      <TabsList><TabsTrigger value="form">Form</TabsTrigger><TabsTrigger value="upload">Upload file</TabsTrigger></TabsList>
      <TabsContent value="form" className="mt-5 space-y-4">
        {rows.map((row, index) => (
          <Card key={row.id} className="border border-border shadow-xs">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div><CardTitle className="text-base">Disruption {index + 1}</CardTitle><CardDescription>Choose the change to include in this repair.</CardDescription></div>
              <Button variant="outline" size="sm" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((entry) => entry.id !== row.id))}>Remove</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={row.type} onValueChange={(value) => value && updateRow(row.id, { type: value as ChangeKind })}>
                <SelectTrigger aria-label={`Disruption ${index + 1} type`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["faculty_unavailable", "room_unavailable", "add_session", "add_faculty", "remove_session"] as const).map((type) => <SelectItem key={type} value={type}>{type.replaceAll("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
              {row.type === "faculty_unavailable" || row.type === "room_unavailable" ? (
                <>
                  <Input aria-label={row.type === "faculty_unavailable" ? "Faculty ID" : "Room ID"} placeholder={row.type === "faculty_unavailable" ? "Faculty ID" : "Room ID"} value={row.target} onChange={(event) => updateRow(row.id, { target: event.target.value })} />
                  <div className="flex flex-wrap gap-2">
                    {days.map((day) => <Button key={day} type="button" size="sm" variant={row.days.includes(day) ? "default" : "outline"} aria-pressed={row.days.includes(day)} onClick={() => updateRow(row.id, { days: row.days.includes(day) ? row.days.filter((item) => item !== day) : [...row.days, day] })}>{day}</Button>)}
                  </div>
                  <Input aria-label="Optional periods" placeholder="Optional periods, e.g. 1,2,3" value={row.periods} onChange={(event) => updateRow(row.id, { periods: event.target.value })} />
                  <Textarea aria-label="Reason" placeholder="Reason" value={row.reason} onChange={(event) => updateRow(row.id, { reason: event.target.value })} />
                </>
              ) : row.type === "remove_session" ? (
                <Input aria-label="Session ID" placeholder="Session ID" value={row.target} onChange={(event) => updateRow(row.id, { target: event.target.value })} />
              ) : (
                <Textarea aria-label={row.type === "add_session" ? "Session JSON" : "Faculty JSON"} className="min-h-36 font-mono text-xs" value={row.json} onChange={(event) => updateRow(row.id, { json: event.target.value })} />
              )}
            </CardContent>
          </Card>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setRows((current) => [...current, newRow()])}>Add disruption row</Button>
          <Button onClick={validateAndSubmit} disabled={mutation.isPending}>{mutation.isPending ? "Submitting…" : "Submit change"}</Button>
        </div>
        {errorText ? <Alert variant="destructive"><AlertTitle>Could not submit</AlertTitle><AlertDescription>{errorText}</AlertDescription></Alert> : null}
      </TabsContent>
      <TabsContent value="upload" className="mt-5 space-y-4">
        <Card className="border border-border shadow-xs">
          <CardHeader><CardTitle>Upload disruption JSON</CardTitle><CardDescription>Select a .json file and review its contents before submitting.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Input type="file" accept=".json,application/json" onChange={(event) => void previewUpload(event.target.files?.[0])} />
            {filePreview ? <pre className="max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs">{filePreview}</pre> : null}
            <Button onClick={() => { setFileError(""); upload.mutate(); }} disabled={!file || !filePreview || upload.isPending}>{upload.isPending ? "Uploading…" : "Submit file"}</Button>
            {fileError ? <Alert variant="destructive"><AlertTitle>Invalid file</AlertTitle><AlertDescription>{fileError}</AlertDescription></Alert> : null}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function RequestChangeForm({
  role,
  department,
  preselectedSession,
  onCreated,
}: {
  role: "FACULTY" | "COORDINATOR";
  department: string | null;
  preselectedSession: string;
  onCreated: (jobId: string, changeId: string) => void;
}) {
  const [sessionId, setSessionId] = useState(preselectedSession);
  const [requestedChange, setRequestedChange] = useState<"move" | "extra">("move");
  const [details, setDetails] = useState('{\n  "reason": ""\n}');
  const [preferredDay, setPreferredDay] = useState("");
  const [preferredPeriod, setPreferredPeriod] = useState("");
  const [validationError, setValidationError] = useState("");

  const sessions = useQuery({
    queryKey: ["change-request-sessions", role, department],
    queryFn: async () => {
      if (role === "FACULTY") {
        const data = await get<unknown>("/api/timetables/me");
        return asArray(data).map(normalizeEntry);
      }
      const groups = asArray(await get<unknown>("/api/public/groups"));
      const deptGroups = groups.filter((raw) => {
        const group = asRecord(raw);
        return !department || String(group.department ?? group.department_id ?? "") === department;
      });
      const views = await Promise.all(deptGroups.map(async (raw) => {
        const group = asRecord(raw);
        const groupId = String(group.group_id ?? group.id ?? "");
        return groupId ? get<unknown>(`/api/timetables/views/group/${encodeURIComponent(groupId)}`) : [];
      }));
      const entries = views.flatMap((view) => asArray(view));
      return [...new Map(entries.map((raw) => {
        const entry = normalizeEntry(raw);
        return [entry.id, entry] as const;
      })).values()];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("Select a session.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(details);
      } catch {
        throw new Error("Details must be valid JSON.");
      }
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("Details must be a JSON object.");
      }
      const preferredPeriodNumber = preferredPeriod ? Number(preferredPeriod) : undefined;
      if (preferredPeriodNumber !== undefined && (!Number.isInteger(preferredPeriodNumber) || preferredPeriodNumber < 1)) {
        throw new Error("Preferred period must be a positive whole number.");
      }
      return post<{ jobId: string; changeId: string }>("/api/changes/request", {
        sessionId,
        requestedChange,
        details: parsed,
        ...(preferredDay ? { preferredDay } : {}),
        ...(preferredPeriodNumber ? { preferredPeriod: preferredPeriodNumber } : {}),
      });
    },
    onSuccess: (result) => onCreated(result.jobId, result.changeId),
    onError: (error) => setValidationError(error instanceof Error ? error.message : "Could not submit the request."),
  });
  const normalizedSessions = useMemo(() => sessions.data ?? [], [sessions.data]);

  return (
    <Card className="border border-border shadow-xs">
      <CardHeader><CardTitle>Request a session change</CardTitle><CardDescription>Select a session in your scope and explain the requested adjustment.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {sessions.isPending ? <TableSkeleton rows={3} columns={2} /> : sessions.isError ? <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} /> : normalizedSessions.length === 0 ? <p className="text-sm text-muted-foreground">No sessions are available in your timetable scope.</p> : (
          <Select value={sessionId || null} onValueChange={(value) => value && setSessionId(value)}>
            <SelectTrigger aria-label="Session"><SelectValue placeholder="Choose a session" /></SelectTrigger>
            <SelectContent>{normalizedSessions.map((entry: TimetableEntry) => <SelectItem key={entry.id} value={entry.id}>{entry.courseId} · {entry.day} P{entry.startPeriod} · {entry.id}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Select value={requestedChange} onValueChange={(value) => value && setRequestedChange(value as "move" | "extra")}>
          <SelectTrigger aria-label="Requested change"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="move">Move this session</SelectItem><SelectItem value="extra">Request an extra session</SelectItem></SelectContent>
        </Select>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={preferredDay || null} onValueChange={(value) => value && setPreferredDay(value)}>
            <SelectTrigger aria-label="Preferred day"><SelectValue placeholder="Preferred day (optional)" /></SelectTrigger>
            <SelectContent>{days.map((day) => <SelectItem key={day} value={day}>{day}</SelectItem>)}</SelectContent>
          </Select>
          <Input aria-label="Preferred period" type="number" min={1} placeholder="Preferred period (optional)" value={preferredPeriod} onChange={(event) => setPreferredPeriod(event.target.value)} />
        </div>
        <div className="space-y-2"><label className="text-sm font-medium">Details (JSON object)</label><Textarea className="min-h-28 font-mono text-xs" value={details} onChange={(event) => setDetails(event.target.value)} /></div>
        {validationError ? <Alert variant="destructive"><AlertTitle>Could not submit</AlertTitle><AlertDescription>{validationError}</AlertDescription></Alert> : null}
        <Button onClick={() => { setValidationError(""); mutation.mutate(); }} disabled={mutation.isPending || sessions.isPending || normalizedSessions.length === 0}>{mutation.isPending ? "Submitting…" : "Submit request"}</Button>
      </CardContent>
    </Card>
  );
}

function UnavailabilityForm({ onCreated }: { onCreated: (jobId: string, changeId: string) => void }) {
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [reason, setReason] = useState("");
  const [errorText, setErrorText] = useState("");
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
    onSuccess: (result) => onCreated(result.jobId, result.changeId),
    onError: (error) => setErrorText(error instanceof Error ? error.message : "Could not submit unavailability."),
  });
  return (
    <Card className="border border-border shadow-xs">
      <CardHeader><CardTitle>Mark unavailable</CardTitle><CardDescription>Submit days and, optionally, the periods you cannot teach.</CardDescription></CardHeader>
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
  );
}

function NewChangeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: user } = useMe();
  const [jobId, setJobId] = useState<string | null>(null);
  const [changeId, setChangeId] = useState<string | null>(null);
  const created = (nextJobId: string, nextChangeId: string) => {
    setChangeId(nextChangeId);
    setJobId(nextJobId);
  };
  if (!user) return <TableSkeleton rows={4} columns={3} />;
  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-semibold tracking-tight">New change</h1><p className="mt-1 text-sm text-muted-foreground">Submit a disruption or request a timetable adjustment.</p></header>
      {user.role === "ADMIN" ? <AdminDisruptionBuilder onCreated={created} /> : user.role === "FACULTY" ? (
        <Tabs defaultValue={searchParams.get("sessionId") ? "request" : "unavailable"}>
          <TabsList><TabsTrigger value="unavailable">Mark unavailable</TabsTrigger><TabsTrigger value="request">Request a change</TabsTrigger></TabsList>
          <TabsContent value="unavailable" className="mt-5"><UnavailabilityForm onCreated={created} /></TabsContent>
          <TabsContent value="request" className="mt-5"><RequestChangeForm role="FACULTY" department={user.department} preselectedSession={searchParams.get("sessionId") ?? ""} onCreated={created} /></TabsContent>
        </Tabs>
      ) : user.role === "COORDINATOR" ? (
        <RequestChangeForm role="COORDINATOR" department={user.department} preselectedSession={searchParams.get("sessionId") ?? ""} onCreated={created} />
      ) : (
        <Alert variant="destructive"><AlertTitle>Not available</AlertTitle><AlertDescription>Your role cannot submit timetable changes.</AlertDescription></Alert>
      )}
      <JobProgressDialog
        jobId={jobId}
        onSuccess={() => {
          setJobId(null);
          if (changeId) router.push(`/changes/${encodeURIComponent(changeId)}`);
        }}
        onClose={() => {
          setJobId(null);
          if (changeId) router.push(`/changes/${encodeURIComponent(changeId)}`);
        }}
      />
    </div>
  );
}

export default function NewChangeClient() {
  return <RequireRole roles={["ADMIN", "COORDINATOR", "FACULTY"]}><Suspense fallback={<TableSkeleton rows={4} columns={3} />}><NewChangeContent /></Suspense></RequireRole>;
}
