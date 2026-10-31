"use client";

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
import { PageHeader } from "@/components/page-header";
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
    <Card>
      <CardHeader>
        <CardTitle>Scheduling data</CardTitle>
        <CardDescription>
          The dataset currently used for campus scheduling.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{dataset.data.label || "Active dataset"}</p>
          {dataset.data.version !== undefined ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Version {dataset.data.version}
            </p>
          ) : null}
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

export default function DashboardPage() {
  const { data: user } = useMe();
  const actions = user ? actionsByRole[user.role] : [];

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back${user?.name ? `, ${user.name}` : ""}`}
        description={
          user
            ? roleDescriptions[user.role]
            : "Your CIT Scheduler workspace."
        }
      />

      <DatasetStatus canManageDatasets={user?.role === "ADMIN"} />

      <section aria-labelledby="dashboard-actions-heading" className="space-y-4">
        <div>
          <h2
            id="dashboard-actions-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Your workspace
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Common tasks and information for your account.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {actions.map(({ title, description, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Card className="h-full transition-colors group-hover:bg-muted/30">
                <CardHeader>
                  <Icon
                    aria-hidden="true"
                    className="mb-1 size-5 text-muted-foreground"
                  />
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-1 text-sm font-medium">
                  Open
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {user?.role === "ADMIN" ? (
        <Card>
          <CardHeader>
            <CardTitle>System activity</CardTitle>
            <CardDescription>
              View recent timetable and exam generation jobs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link href="/admin/jobs" />}
            >
              <ListChecks aria-hidden="true" />
              Open job history
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
