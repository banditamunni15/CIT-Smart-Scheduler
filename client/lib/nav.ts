import {
  BellRing,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Database,
  LayoutDashboard,
  ListChecks,
  Settings,
  Users,
  BriefcaseBusiness,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "./session";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: readonly UserRole[];
};

export type NavigationGroup = {
  label?: string;
  items: NavigationItem[];
};

const allRoles: readonly UserRole[] = [
  "ADMIN",
  "COORDINATOR",
  "FACULTY",
  "CLUB",
];
const adminCoordinator: readonly UserRole[] = ["ADMIN", "COORDINATOR"];

export const navigation: NavigationGroup[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: allRoles },
      { label: "Timetable", href: "/timetable", icon: CalendarDays, roles: allRoles },
      { label: "Exams", href: "/exams", icon: BookOpen, roles: allRoles },
      { label: "Bookings", href: "/bookings", icon: ClipboardCheck, roles: allRoles },
      { label: "Changes", href: "/changes", icon: BellRing, roles: allRoles },
      { label: "Approvals", href: "/approvals", icon: ListChecks, roles: adminCoordinator },
      { label: "My week", href: "/my-week", icon: CalendarDays, roles: ["FACULTY"] },
      { label: "Unavailability", href: "/unavailability", icon: BellRing, roles: ["FACULTY"] },
      { label: "Department", href: "/department", icon: Users, roles: ["COORDINATOR"] },
      { label: "Manual schedule", href: "/manual-schedule", icon: BriefcaseBusiness, roles: adminCoordinator },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Datasets", href: "/admin/datasets", icon: Database, roles: ["ADMIN"] },
      { label: "Timetables", href: "/admin/timetables", icon: CalendarDays, roles: ["ADMIN"] },
      { label: "Exams", href: "/admin/exams", icon: BookOpen, roles: ["ADMIN"] },
      { label: "Jobs", href: "/admin/jobs", icon: ListChecks, roles: ["ADMIN"] },
      { label: "Settings", href: "/admin/settings", icon: Settings, roles: ["ADMIN"] },
    ],
  },
];
