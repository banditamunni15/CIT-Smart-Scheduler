"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Database,
  FilePlus2,
  ListChecks,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ApiClientError, get } from "@/lib/api";
import type { UserRole } from "@/lib/session";
import { useMe } from "@/lib/session";
import { ErrorState } from "@/components/error-state";
import { ToneIcon } from "@/components/tone-icon";
import { toneCycle, toneStyles } from "@/lib/tones";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ActiveDataset = {
  id: string;
  label?: string;
  version?: number;
};

type DashboardAction = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

const actionsByRole: Record<UserRole, DashboardAction[]> = {
  ADMIN: [
    {
      title: "Manage timetables",
      description: "Generate, review, and publish timetable drafts.",
      href: "/admin/timetables",
      icon: CalendarDays,
    },
    {
      title: "Manage exam schedules",
      description: "Generate and publish exam schedules.",
      href: "/admin/exams",
      icon: BookOpen,
    },
    {
      title: "Manage datasets",
      description: "Upload scheduling data and choose the active dataset.",
      href: "/admin/datasets",
      icon: Database,
    },
    {
      title: "Review booking requests",
      description: "View and process campus booking requests.",
      href: "/bookings",
      icon: ClipboardCheck,
    },
  ],
  COORDINATOR: [
    {
      title: "Department workspace",
      description: "Review your department timetable and requests.",
      href: "/department",
      icon: Users,
    },
    {
      title: "Booking requests",
      description: "Review requests and their current status.",
      href: "/bookings",
      icon: ClipboardCheck,
    },
    {
      title: "Request a timetable change",
      description: "Submit a change request for a scheduled class.",
      href: "/changes/new",
      icon: FilePlus2,
    },
    {
      title: "Browse timetable",
      description: "Find scheduled sessions by group or room.",
      href: "/timetable",
      icon: CalendarDays,
    },
  ],
  FACULTY: [
    {
      title: "View my week",
      description: "See your sessions on the published timetable.",
      href: "/my-week",
      icon: CalendarDays,
    },
    {
      title: "Report unavailability",
      description: "Submit or review your unavailable periods.",
      href: "/unavailability",
      icon: ClipboardCheck,
    },
    {
      title: "Request a timetable change",
      description: "Ask for a change to one of your scheduled sessions.",
      href: "/changes/new",
      icon: FilePlus2,
    },
    {
      title: "Browse exam schedules",
      description: "Find published exams for your group.",
      href: "/exams",
      icon: BookOpen,
    },
  ],
  CLUB: [
    {
      title: "Create a booking request",
      description: "Request a room for an upcoming club event.",
      href: "/bookings/new",
      icon: FilePlus2,
    },
    {
      title: "Track bookings",
      description: "Review your booking requests and their status.",
      href: "/bookings",
      icon: ClipboardCheck,
    },
    {
      title: "Browse timetable",
      description: "Find scheduled sessions by group or room.",
      href: "/timetable",
      icon: CalendarDays,
    },
    {
      title: "Browse exam schedules",
      description: "Find published exams for your group.",
      href: "/exams",
      icon: BookOpen,
    },
  ],
};

const roleDescriptions: Record<UserRole, string> = {
  ADMIN: "Manage campus scheduling and keep published information up to date.",
  COORDINATOR: "Review department schedules, requests, and upcoming changes.",
  FACULTY: "Keep track of your teaching schedule and scheduling requests.",
  CLUB: "Plan events and keep track of your room booking requests.",
};

function DatasetStatus({ canManageDatasets }: { canManageDatasets: boolean }) {
  const dataset = useQuery({
    queryKey: ["dashboard", "active-dataset"],
    queryFn: () => get<ActiveDataset>("/api/datasets/active"),
    retry: false,
  });

  if (dataset.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Scheduling data</CardTitle>
          <CardDescription>Checking the active campus dataset.</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-5 w-48" />
        </CardContent>
      </Card>
    );
  }

  if (dataset.isError) {
    const noActiveDataset =
      dataset.error instanceof ApiClientError &&
      dataset.error.code === "NO_ACTIVE_DATASET";
    if (noActiveDataset) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Scheduling data</CardTitle>
            <CardDescription>
              There is no active campus dataset right now.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {canManageDatasets
                ? "Published scheduling information may not be available until a dataset is activated."
                : "Please contact an administrator if scheduling information should be available."}
            </p>
            {canManageDatasets ? (
              <Button
                nativeButton={false}
                variant="outline"
                size="sm"
                render={<Link href="/admin/datasets" />}
              >
                <Database aria-hidden="true" />
                Manage datasets
              </Button>
            ) : null}
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Scheduling data</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorState
            error={dataset.error}
            onRetry={() => void dataset.refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-emerald-500">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ToneIcon icon={Database} tone="emerald" />
          <div>
            <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">
              Active scheduling data
            </p>
            <p className="font-semibold">{dataset.data.label || "Active dataset"}</p>
            {dataset.data.version !== undefined ? (
              <p className="text-sm text-muted-foreground">
                Version {dataset.data.version}
              </p>
            ) : null}
          </div>
        </div>
        <Button
          nativeButton={false}
          variant="outline"
          size="sm"
          render={<Link href="/timetable" />}
        >
          View timetable
          <ArrowUpRight aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { data: user } = useMe();
  const actions = user ? actionsByRole[user.role] : [];
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <div className="space-y-8">
      <section className="bg-brand relative overflow-hidden rounded-3xl text-white shadow-lift">
        <div aria-hidden="true" className="bg-dots absolute inset-0 opacity-50" />
        <div
          aria-hidden="true"
          className="absolute -top-16 left-1/3 size-56 rounded-full bg-fuchsia-400/30 blur-3xl"
        />
        <div className="relative grid items-end gap-4 px-6 pt-7 sm:px-8 md:grid-cols-[1.2fr_1fr]">
          <div className="pb-7">
            <p className="text-sm font-medium text-indigo-100">
              {greeting()}
              {firstName ? "," : ""}
            </p>
            <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
              {firstName ?? "Welcome back"}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-indigo-100/90">
              {user
                ? roleDescriptions[user.role]
                : "Your CIT Scheduler workspace."}
            </p>
          </div>
          <Image
            src="/illustrations/campus.svg"
            alt=""
            width={640}
            height={400}
            unoptimized
            aria-hidden="true"
            className="hidden w-full translate-y-1 md:block"
          />
        </div>
      </section>

      <DatasetStatus canManageDatasets={user?.role === "ADMIN"} />

      <section aria-labelledby="dashboard-actions-heading" className="space-y-4">
        <div>
          <h2
            id="dashboard-actions-heading"
            className="text-lg font-bold tracking-tight"
          >
            Your workspace
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Common tasks and information for your account.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {actions.map(({ title, description, href, icon }, index) => {
            const tone = toneCycle[index % toneCycle.length] ?? "indigo";
            return (
              <Link
                key={href + title}
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
                    Open
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {user?.role === "ADMIN" ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ToneIcon icon={ListChecks} tone="teal" />
              <div>
                <p className="font-semibold">System activity</p>
                <p className="text-sm text-muted-foreground">
                  View recent timetable and exam generation jobs.
                </p>
              </div>
            </div>
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link href="/admin/jobs" />}
            >
              Open job history
              <ArrowUpRight aria-hidden="true" />
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
