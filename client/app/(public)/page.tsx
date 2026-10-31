"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, DoorOpen, FileText } from "lucide-react";
import { ApiClientError, get } from "@/lib/api";
import { normalizePublicGroups, type PublicOption } from "@/lib/public-data";
import { ErrorState } from "@/components/error-state";
import { TableSkeleton } from "@/components/table-skeleton";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ActiveDataset = { id: string; label?: string };

const destinations = [
  {
    title: "Timetable",
    description: "Browse the published timetable by group or room.",
    href: "/timetable",
    icon: CalendarDays,
  },
  {
    title: "Exams",
    description: "Find the published exam schedule for your group.",
    href: "/exams",
    icon: FileText,
  },
  {
    title: "Free rooms",
    description: "See which rooms are available for a period.",
    href: "/free-rooms",
    icon: DoorOpen,
  },
];

export default function PublicHomePage() {
  const [groupId, setGroupId] = useState("");
  const active = useQuery({
    queryKey: ["public", "active-dataset"],
    queryFn: () => get<ActiveDataset>("/api/datasets/active"),
    retry: false,
  });
  const groups = useQuery({
    queryKey: ["public", "groups"],
    queryFn: async () => normalizePublicGroups(await get<unknown>("/api/public/groups")),
    enabled: active.isSuccess,
  });
  const noActiveDataset =
    active.error instanceof ApiClientError &&
    active.error.code === "NO_ACTIVE_DATASET";

  return (
    <div className="space-y-12 py-8 sm:py-12">
      <section className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          CIT Scheduler
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
          Find your campus timetable, exam schedule, and available rooms in one
          place.
        </p>
        <div className="mt-8 flex w-full max-w-xl flex-col gap-3 sm:flex-row">
          {groups.isPending && active.isSuccess ? (
            <div className="flex-1">
              <TableSkeleton rows={1} columns={1} />
            </div>
          ) : groups.isError ? (
            <div className="w-full">
              <ErrorState
                error={groups.error}
                onRetry={() => void groups.refetch()}
              />
            </div>
          ) : (
            <>
              <Select value={groupId || null} onValueChange={(value) => setGroupId(value ?? "")}>
                <SelectTrigger aria-label="Select a group" className="h-10 flex-1">
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  {(groups.data ?? []).map((group: PublicOption) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!groupId}
                nativeButton={false}
                render={
                  <Link
                    href={groupId ? `/timetable?group=${encodeURIComponent(groupId)}` : "/timetable"}
                  />
                }
                className="h-10"
              >
                View timetable
              </Button>
            </>
          )}
        </div>
      </section>

      {active.isPending ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {destinations.map((destination) => (
            <TableSkeleton key={destination.title} rows={2} columns={1} />
          ))}
        </div>
      ) : noActiveDataset ? (
        <Alert className="mx-auto max-w-3xl bg-card">
          <CalendarDays aria-hidden="true" />
          <AlertTitle>Scheduling information is not available yet</AlertTitle>
          <AlertDescription>
            There is no active schedule to browse right now. Please check back
            later.
          </AlertDescription>
        </Alert>
      ) : active.isError ? (
        <div className="mx-auto max-w-3xl">
          <ErrorState error={active.error} onRetry={() => void active.refetch()} />
        </div>
      ) : (
        <section aria-label="Explore scheduling" className="grid gap-4 sm:grid-cols-3">
          {destinations.map(({ title, description, href, icon: Icon }) => (
            <Link key={href} href={href} className="group rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <Card className="h-full border border-border shadow-xs transition-colors group-hover:bg-muted/30">
                <CardHeader>
                  <Icon aria-hidden="true" className="mb-2 size-5 text-muted-foreground" />
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm font-medium underline decoration-transparent underline-offset-4 group-hover:decoration-current">
                  Explore {title.toLowerCase()}
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
