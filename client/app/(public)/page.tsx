"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  DoorOpen,
  FileText,
  GraduationCap,
  ShieldCheck,
  Users,
} from "lucide-react";
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
import { ToneIcon } from "@/components/tone-icon";
import { toneStyles, type Tone } from "@/lib/tones";
import { cn } from "cn";

type ActiveDataset = { id: string; label?: string };

const destinations: Array<{
  title: string;
  description: string;
  href: string;
  icon: typeof CalendarDays;
  tone: Tone;
}> = [
  {
    title: "Timetable",
    description: "Browse the published timetable by group or room.",
    href: "/timetable",
    icon: CalendarDays,
    tone: "sky",
  },
  {
    title: "Exams",
    description: "Find the published exam schedule for your group.",
    href: "/exams",
    icon: FileText,
    tone: "violet",
  },
  {
    title: "Free rooms",
    description: "See which rooms are available for a period.",
    href: "/free-rooms",
    icon: DoorOpen,
    tone: "emerald",
  },
];

const audiences = [
  {
    icon: GraduationCap,
    tone: "indigo" as Tone,
    title: "Students",
    text: "See your weekly timetable and exam dates without signing in.",
  },
  {
    icon: Users,
    tone: "amber" as Tone,
    title: "Faculty and clubs",
    text: "Mark availability, request changes and book venues with clear reasons.",
  },
  {
    icon: ShieldCheck,
    tone: "rose" as Tone,
    title: "Administration",
    text: "Generate, check and publish schedules that follow every rule.",
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
    <div className="space-y-14 py-4 sm:py-8">
      <section className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700 shadow-xs">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
            Chilika Institute of Technology
          </span>
          <h1 className="mt-5 font-heading text-4xl leading-[1.1] font-extrabold tracking-tight sm:text-5xl">
            Your campus timetable,{" "}
            <span className="bg-linear-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
              always in sync.
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            Find your class timetable, exam schedule and free rooms in one
            place, updated the moment a change is published.
          </p>
          <div className="mt-7 flex w-full max-w-xl flex-col gap-3 sm:flex-row">
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
                  <SelectTrigger
                    aria-label="Select a group"
                    className="h-11 w-full bg-card shadow-soft sm:w-auto sm:flex-1"
                  >
                    <SelectValue placeholder="Select your group" />
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
                  className="h-11 px-5"
                >
                  View timetable
                  <ArrowRight aria-hidden="true" />
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute -inset-3 rounded-[2rem] bg-linear-to-br from-indigo-200/70 via-violet-200/60 to-pink-200/60 blur-xl"
          />
          <div className="bg-brand relative overflow-hidden rounded-3xl shadow-lift ring-1 ring-white/40">
            <div aria-hidden="true" className="bg-dots absolute inset-0 opacity-50" />
            <Image
              src="/illustrations/campus.svg"
              alt="Illustration of the college campus"
              width={640}
              height={400}
              priority
              unoptimized
              className="relative w-full"
            />
          </div>
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
          {destinations.map(({ title, description, href, icon, tone }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Card
                className={cn(
                  "relative h-full border border-transparent transition-all group-hover:-translate-y-0.5 group-hover:shadow-lift",
                  toneStyles[tone].hover,
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-0 top-0 h-1 bg-linear-to-r",
                    toneStyles[tone].bar,
                  )}
                />
                <CardHeader>
                  <ToneIcon icon={icon} tone={tone} className="mb-2" />
                  <CardTitle className="text-base font-bold">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-1 text-sm font-semibold text-indigo-700">
                  Explore {title.toLowerCase()}
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                  />
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      )}

      <section
        aria-label="Who it is for"
        className="grid items-center gap-8 rounded-3xl border border-indigo-100 bg-white p-6 shadow-soft sm:p-8 lg:grid-cols-[1fr_1.1fr]"
      >
        <Image
          src="/illustrations/library.svg"
          alt="Illustration of library bookshelves"
          width={360}
          height={220}
          unoptimized
          className="mx-auto w-full max-w-sm"
        />
        <div>
          <h2 className="font-heading text-2xl font-bold tracking-tight">
            Built for everyone on campus
          </h2>
          <ul className="mt-5 space-y-4">
            {audiences.map(({ icon, tone, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <ToneIcon icon={icon} tone={tone} className="size-9" />
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
