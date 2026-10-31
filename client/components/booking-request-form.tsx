"use client";

import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApiClientError, get, patch, post } from "@/lib/api";
import { normalizePublicGroups, type PublicOption } from "@/lib/public-data";
import { asRecord, prettyJson } from "@/lib/admin-data";
import { categoryLabel } from "@/lib/bookings";
import { useMe, type UserRole } from "@/lib/session";

const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const categories = [
  "INSTITUTE_EVENT",
  "GUEST_LECTURE",
  "DEPARTMENT_EVENT",
  "CLUB_EVENT",
] as const;
const roomTypeOptions = [
  "CLASSROOM",
  "LAB",
  "AUDITORIUM",
  "SEMINAR_HALL",
  "CONFERENCE_ROOM",
];
const needOptions = [
  "PROJECTOR",
  "COMPUTERS",
  "WHITEBOARD",
  "AUDIO",
  "VIDEO_CONFERENCING",
  "LAB_EQUIPMENT",
  "ACCESSIBILITY",
];

const windowSchema = z.object({
  day: z.enum(days),
  from_period: z.coerce.number().int().positive(),
  to_period: z.coerce.number().int().positive(),
}).refine((value) => value.to_period >= value.from_period, {
  path: ["to_period"],
  message: "End period must not be before start period.",
});

const requestSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200),
  attendance: z.coerce.number().int().positive("Attendance must be at least 1."),
  durationPeriods: z.coerce.number().int().positive("Duration must be at least 1."),
  windows: z.array(windowSchema).min(1, "Add at least one time window."),
  roomTypes: z.array(z.string().min(1)),
  needs: z.array(z.string().min(1)),
  requestedRoom: z.string().trim().optional(),
  mandatoryForGroups: z.array(z.string().min(1)),
  seriesId: z.string().trim().optional(),
  requestedCategory: z.enum(categories),
  rawText: z.string().max(20000).optional(),
});

type RequestValues = z.input<typeof requestSchema>;
type ParsedRequest = z.output<typeof requestSchema>;
type BookingLike = Record<string, unknown>;
type FormMode = "create" | "edit" | "manual";

const categoryCap: Record<UserRole, string> = {
  ADMIN: "INSTITUTE_EVENT",
  COORDINATOR: "DEPARTMENT_EVENT",
  FACULTY: "DEPARTMENT_EVENT",
  CLUB: "CLUB_EVENT",
};

function initialValues(request?: BookingLike): RequestValues {
  const rawWindows = Array.isArray(request?.windows) ? request.windows : [];
  const windows = rawWindows.flatMap((item) => {
    const record = asRecord(item);
    if (
      typeof record.day !== "string" ||
      !days.includes(record.day as (typeof days)[number])
    ) return [];
    return [{
      day: record.day as (typeof days)[number],
      from_period: Number(record.from_period) || 1,
      to_period: Number(record.to_period) || 1,
    }];
  });
  return {
    title: typeof request?.title === "string" ? request.title : "",
    attendance: Number(request?.attendance) || 1,
    durationPeriods: Number(request?.durationPeriods) || 1,
    windows: windows.length ? windows : [{ day: "MON", from_period: 1, to_period: 1 }],
    roomTypes: Array.isArray(request?.roomTypes) ? request.roomTypes.filter((value): value is string => typeof value === "string") : [],
    needs: Array.isArray(request?.needs) ? request.needs.filter((value): value is string => typeof value === "string") : [],
    requestedRoom: typeof request?.requestedRoom === "string" ? request.requestedRoom : "",
    mandatoryForGroups: Array.isArray(request?.mandatoryForGroups) ? request.mandatoryForGroups.filter((value): value is string => typeof value === "string") : [],
    seriesId: typeof request?.seriesId === "string" ? request.seriesId : "",
    requestedCategory: categories.includes(request?.requestedCategory as (typeof categories)[number])
      ? request?.requestedCategory as (typeof categories)[number]
      : "CLUB_EVENT",
    rawText: typeof request?.rawText === "string" ? request.rawText : "",
  };
}

function MultiSelectBadges({
  label,
  values,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [custom, setCustom] = useState("");
  const available = [...new Set([...options, ...values])];
  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Select
        value={null}
        onValueChange={(value) => {
          if (value) toggle(value);
        }}
      >
        <SelectTrigger aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {available.map((option) => (
            <SelectItem key={option} value={option}>
              {values.includes(option) ? `✓ ${option}` : option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <Badge key={value} variant="secondary" className="gap-1">
            {value}
            <button type="button" aria-label={`Remove ${value}`} onClick={() => toggle(value)} className="ml-1 rounded-full hover:text-destructive">×</button>
          </Badge>
        ))}
        {!values.length ? <span className="text-xs text-muted-foreground">None selected.</span> : null}
      </div>
      <div className="flex gap-2">
        <Input
          aria-label={`Add custom ${label.toLowerCase()}`}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder={`Add another ${label.toLowerCase().replace(/s$/, "")}`}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const normalized = custom.trim();
              if (normalized && !values.includes(normalized)) onChange([...values, normalized]);
              setCustom("");
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!custom.trim()}
          onClick={() => {
            const normalized = custom.trim();
            if (normalized && !values.includes(normalized)) onChange([...values, normalized]);
            setCustom("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

export function BookingRequestForm({
  mode,
  request,
  onComplete,
}: {
  mode: FormMode;
  request?: BookingLike;
  onComplete?: (result: unknown) => void;
}) {
  const { data: user } = useMe();
  const [checkResult, setCheckResult] = useState<{ ok: boolean; issues: unknown[] } | null>(null);
  const [checkNotice, setCheckNotice] = useState("");
  const [formError, setFormError] = useState<unknown>(null);
  const [manual, setManual] = useState({
    day: "MON",
    startPeriod: "1",
    endPeriod: "1",
    roomId: "",
    reason: "",
  });
  const groups = useQuery({
    queryKey: ["public", "groups"],
    queryFn: async () => normalizePublicGroups(await get<unknown>("/api/public/groups")),
  });
  const form = useForm<RequestValues, undefined, ParsedRequest>({
    resolver: zodResolver(requestSchema),
    defaultValues: initialValues(request),
    mode: "onChange",
  });
  const windows = useFieldArray({ control: form.control, name: "windows" });
  const watchedWindows = useWatch({ control: form.control, name: "windows" });

  const requestMutation = useMutation({
    mutationFn: async (values: ParsedRequest) => {
      if (mode === "manual") {
        const startPeriod = Number(manual.startPeriod);
        const endPeriod = Number(manual.endPeriod);
        if (!manual.roomId.trim() || !manual.reason.trim()) {
          throw new Error("Enter a room and reason for the manual booking.");
        }
        if (!Number.isInteger(startPeriod) || !Number.isInteger(endPeriod) || endPeriod < startPeriod) {
          throw new Error("Enter a valid start and end period.");
        }
        return post("/api/bookings/manual", {
          ...values,
          requestedRoom: values.requestedRoom || undefined,
          seriesId: values.seriesId || undefined,
          day: manual.day,
          startPeriod,
          endPeriod,
          roomId: manual.roomId.trim(),
          reason: manual.reason.trim(),
        });
      }
      if (mode === "edit") {
        return patch(`/api/bookings/${encodeURIComponent(String(request?.id ?? ""))}`, {
          ...values,
          requestedRoom: values.requestedRoom || undefined,
          seriesId: values.seriesId || undefined,
        });
      }
      return post("/api/bookings", {
        ...values,
        requestedRoom: values.requestedRoom || undefined,
        seriesId: values.seriesId || undefined,
      });
    },
    onSuccess: (result) => {
      setFormError(null);
      onComplete?.(result);
    },
    onError: setFormError,
  });

  const checkDraft = useMutation({
    mutationFn: (values: ParsedRequest) => post<{ ok: boolean; issues: unknown[] }>("/api/bookings/check-draft", {
      ...values,
      requestedRoom: values.requestedRoom || undefined,
      seriesId: values.seriesId || undefined,
    }),
    onSuccess: (result) => {
      setCheckResult(result);
      setCheckNotice("");
    },
    onError: (error) => {
      setCheckResult(null);
      if (error instanceof ApiClientError && error.code === "NO_PUBLISHED_TIMETABLE") {
        setCheckNotice("Draft checks are unavailable until a timetable has been published. You can still submit this request.");
      } else {
        setFormError(error);
      }
    },
  });

  const selectedTypes = useWatch({ control: form.control, name: "roomTypes" });
  const selectedNeeds = useWatch({ control: form.control, name: "needs" });
  const selectedGroups = useWatch({ control: form.control, name: "mandatoryForGroups" });
  const requestedCategory = useWatch({ control: form.control, name: "requestedCategory" });
  const cap = user ? categoryCap[user.role] : "CLUB_EVENT";

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    requestMutation.mutate(values);
  });

  return (
    <form onSubmit={submit} className="space-y-5">
      {mode === "create" ? (
        <Card className="border border-border shadow-xs">
          <CardHeader>
            <CardTitle>Describe in plain words (coming soon)</CardTitle>
            <CardDescription>This AI-assisted request composer is not available yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea disabled placeholder="Describe the event and your scheduling needs…" />
          </CardContent>
        </Card>
      ) : null}

      <Card className="border border-border shadow-xs">
        <CardHeader>
          <CardTitle>{mode === "manual" ? "Booking details" : mode === "edit" ? "Edit request" : "Request details"}</CardTitle>
          <CardDescription>Complete the event details and one or more acceptable time windows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label htmlFor="booking-title" className="text-sm font-medium">Title</label>
              <Input id="booking-title" {...form.register("title")} />
              {form.formState.errors.title ? <p className="text-xs text-destructive">{form.formState.errors.title.message}</p> : null}
            </div>
            <div className="space-y-2">
              <label htmlFor="booking-attendance" className="text-sm font-medium">Attendance</label>
              <Input id="booking-attendance" type="number" min={1} {...form.register("attendance", { valueAsNumber: true })} />
              {form.formState.errors.attendance ? <p className="text-xs text-destructive">{form.formState.errors.attendance.message}</p> : null}
            </div>
            <div className="space-y-2">
              <label htmlFor="booking-duration" className="text-sm font-medium">Duration (periods)</label>
              <Input id="booking-duration" type="number" min={1} {...form.register("durationPeriods", { valueAsNumber: true })} />
              {form.formState.errors.durationPeriods ? <p className="text-xs text-destructive">{form.formState.errors.durationPeriods.message}</p> : null}
            </div>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Time windows</h3>
                <p className="text-xs text-muted-foreground">Each window describes an allowed period range.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => windows.append({ day: "MON", from_period: 1, to_period: 1 })}>
                Add window
              </Button>
            </div>
            {windows.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Day</label>
                  <Select value={watchedWindows?.[index]?.day} onValueChange={(value) => value && form.setValue(`windows.${index}.day`, value as (typeof days)[number], { shouldDirty: true })}>
                    <SelectTrigger aria-label={`Window ${index + 1} day`}><SelectValue /></SelectTrigger>
                    <SelectContent>{days.map((day) => <SelectItem key={day} value={day}>{day}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`window-from-${index}`} className="text-xs font-medium">From period</label>
                  <Input id={`window-from-${index}`} type="number" min={1} {...form.register(`windows.${index}.from_period`, { valueAsNumber: true })} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`window-to-${index}`} className="text-xs font-medium">To period</label>
                  <Input id={`window-to-${index}`} type="number" min={1} {...form.register(`windows.${index}.to_period`, { valueAsNumber: true })} />
                </div>
                <Button type="button" variant="outline" size="sm" disabled={windows.fields.length === 1} onClick={() => windows.remove(index)}>Remove</Button>
                {form.formState.errors.windows?.[index]?.to_period ? <p className="text-xs text-destructive sm:col-span-4">{form.formState.errors.windows[index]?.to_period?.message}</p> : null}
              </div>
            ))}
            {form.formState.errors.windows?.root ? <p className="text-xs text-destructive">{form.formState.errors.windows.root.message}</p> : null}
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <MultiSelectBadges
              label="Room types"
              values={selectedTypes}
              options={roomTypeOptions}
              onChange={(values) => form.setValue("roomTypes", values, { shouldDirty: true })}
              placeholder="Choose room types"
            />
            <MultiSelectBadges
              label="Needs"
              values={selectedNeeds}
              options={needOptions}
              onChange={(values) => form.setValue("needs", values, { shouldDirty: true })}
              placeholder="Choose equipment or needs"
            />
            <div className="space-y-2">
              <label htmlFor="requested-room" className="text-sm font-medium">Requested room (optional)</label>
              <Input id="requested-room" {...form.register("requestedRoom")} />
            </div>
            <div className="space-y-2">
              <label htmlFor="series-id" className="text-sm font-medium">Series ID (optional)</label>
              <Input id="series-id" {...form.register("seriesId")} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Mandatory for groups</label>
            {groups.isPending ? (
              <p className="text-xs text-muted-foreground">Loading groups…</p>
            ) : groups.isError ? (
              <p className="text-xs text-destructive">Could not load groups. <button type="button" className="underline" onClick={() => void groups.refetch()}>Retry</button></p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {groups.data.map((group: PublicOption) => {
                  const checked = selectedGroups.includes(group.id);
                  return (
                    <label key={group.id} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${checked ? "border-foreground bg-muted" : "bg-card hover:bg-muted/50"}`}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => form.setValue(
                          "mandatoryForGroups",
                          checked ? selectedGroups.filter((id) => id !== group.id) : [...selectedGroups, group.id],
                          { shouldDirty: true },
                        )}
                      />
                      {group.label}
                    </label>
                  );
                })}
                {!groups.data.length ? <span className="text-xs text-muted-foreground">No groups are available.</span> : null}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Requested category</label>
            <Select
              value={requestedCategory}
              onValueChange={(value) => value && form.setValue("requestedCategory", value as RequestValues["requestedCategory"], { shouldDirty: true })}
            >
              <SelectTrigger aria-label="Requested category"><SelectValue /></SelectTrigger>
              <SelectContent>{categories.map((category) => <SelectItem key={category} value={category}>{categoryLabel(category)}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Your role can request up to {categoryLabel(cap).toLowerCase()}. Higher requests are automatically capped by the server.
            </p>
          </div>

          {mode === "manual" ? (
            <section className="space-y-3 rounded-md border p-4">
              <h3 className="text-sm font-medium">Manual placement</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Day</label>
                  <Select value={manual.day} onValueChange={(value) => value && setManual({ ...manual, day: value })}>
                    <SelectTrigger aria-label="Manual booking day"><SelectValue /></SelectTrigger>
                    <SelectContent>{days.map((day) => <SelectItem key={day} value={day}>{day}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><label htmlFor="manual-room" className="text-xs font-medium">Room ID</label><Input id="manual-room" value={manual.roomId} onChange={(event) => setManual({ ...manual, roomId: event.target.value })} /></div>
                <div className="space-y-1.5"><label htmlFor="manual-start" className="text-xs font-medium">Start period</label><Input id="manual-start" type="number" min={1} value={manual.startPeriod} onChange={(event) => setManual({ ...manual, startPeriod: event.target.value })} /></div>
                <div className="space-y-1.5"><label htmlFor="manual-end" className="text-xs font-medium">End period</label><Input id="manual-end" type="number" min={1} value={manual.endPeriod} onChange={(event) => setManual({ ...manual, endPeriod: event.target.value })} /></div>
                <div className="space-y-1.5 sm:col-span-2"><label htmlFor="manual-reason" className="text-xs font-medium">Reason</label><Textarea id="manual-reason" value={manual.reason} onChange={(event) => setManual({ ...manual, reason: event.target.value })} maxLength={2000} /></div>
              </div>
            </section>
          ) : null}

          {formError ? (
            <Alert variant="destructive">
              <AlertTitle>{mode === "manual" ? "Manual placement could not be saved" : "Request could not be saved"}</AlertTitle>
              <AlertDescription>
                <p>{formError instanceof Error ? formError.message : "The request could not be saved."}</p>
                {formError instanceof ApiClientError && formError.code === "SCHEDULE_RULE_VIOLATION" ? (
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-xs">{prettyJson(formError.details)}</pre>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          {checkNotice ? <Alert><AlertTitle>Draft check unavailable</AlertTitle><AlertDescription>{checkNotice}</AlertDescription></Alert> : null}
          {checkResult ? (
            <Alert variant={checkResult.ok ? "default" : "destructive"}>
              <AlertTitle>{checkResult.ok ? "Draft check passed" : "Scheduling issues found"}</AlertTitle>
              <AlertDescription>
                {checkResult.issues.length ? (
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {checkResult.issues.map((issue, index) => (
                      <li key={index}>{typeof issue === "string" ? issue : prettyJson(issue)}</li>
                    ))}
                  </ul>
                ) : <p>No issues were reported.</p>}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {mode === "create" ? (
              <Button type="button" variant="outline" disabled={checkDraft.isPending} onClick={form.handleSubmit((values) => checkDraft.mutate(values))}>
                {checkDraft.isPending ? "Checking…" : "Check draft"}
              </Button>
            ) : null}
            <Button type="submit" disabled={requestMutation.isPending}>
              {requestMutation.isPending ? "Saving…" : mode === "edit" ? "Save changes" : mode === "manual" ? "Place booking" : "Submit request"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
