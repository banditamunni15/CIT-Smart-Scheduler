"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu, ChevronDown, LogOut } from "lucide-react";
import { cn } from "cn";
import { signOut } from "@/lib/auth-client";
import { navigation, type NavigationGroup } from "@/lib/nav";
import { useMe, hasRole, type UserRole } from "@/lib/session";
import { showApiError } from "@/lib/errors";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AssistantChat } from "@/components/assistant-chat";

// Icon colours on the dark sidebar, keyed by route.
const navIconColour: Record<string, string> = {
  "/dashboard": "text-indigo-300",
  "/timetable": "text-sky-300",
  "/exams": "text-violet-300",
  "/bookings": "text-amber-300",
  "/changes": "text-rose-300",
  "/approvals": "text-emerald-300",
  "/my-week": "text-sky-300",
  "/unavailability": "text-rose-300",
  "/department": "text-teal-300",
  "/manual-schedule": "text-amber-300",
  "/admin/datasets": "text-teal-300",
  "/admin/timetables": "text-sky-300",
  "/admin/exams": "text-violet-300",
  "/admin/jobs": "text-emerald-300",
  "/admin/settings": "text-indigo-300",
};

const roleChip: Record<string, string> = {
  ADMIN: "border-rose-200 bg-rose-50 text-rose-700",
  COORDINATOR: "border-amber-200 bg-amber-50 text-amber-700",
  FACULTY: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CLUB: "border-sky-200 bg-sky-50 text-sky-700",
};

function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/illustrations/logo.svg"
      alt=""
      width={36}
      height={36}
      unoptimized
      aria-hidden="true"
      className={cn("size-9 rounded-xl shadow-md shadow-black/20", className)}
    />
  );
}

function NavigationContent({
  groups,
  pathname,
  onNavigate,
}: {
  groups: NavigationGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Main navigation" className="space-y-6 px-3 py-4">
      {groups.map((group, groupIndex) => (
        <div key={group.label ?? `group-${groupIndex}`}>
          {group.label ? (
            <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-indigo-300/70 uppercase">
              {group.label}
            </p>
          ) : null}
          <div className="space-y-1">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300",
                    active
                      ? "bg-white/12 font-semibold text-white shadow-sm"
                      : "text-indigo-100/80 hover:bg-white/8 hover:text-white",
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-2 bottom-2 left-0 w-1 rounded-r-full bg-linear-to-b from-amber-300 to-pink-400"
                    />
                  ) : null}
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-[18px] shrink-0",
                      navIconColour[href] ?? "text-indigo-300",
                    )}
                  />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarBrand() {
  return (
    <Link
      href="/dashboard"
      className="flex h-16 shrink-0 items-center gap-3 px-5 focus-visible:outline-2 focus-visible:outline-indigo-300"
    >
      <BrandMark />
      <span className="leading-tight">
        <span className="block font-heading text-[15px] font-bold tracking-tight text-white">
          CIT Scheduler
        </span>
        <span className="block text-[11px] text-indigo-200/80">
          Chilika Institute of Technology
        </span>
      </span>
    </Link>
  );
}

function SidebarFooter() {
  return (
    <div className="m-3 mt-0 overflow-hidden rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
      <div className="flex items-center gap-3">
        <Image
          src="/illustrations/graduation.svg"
          alt=""
          width={44}
          height={44}
          unoptimized
          aria-hidden="true"
          className="size-11 shrink-0"
        />
        <p className="text-xs leading-snug text-indigo-100/90">
          Clash-free timetables, fair venue booking and quick change repair.
        </p>
      </div>
    </div>
  );
}

function visibleNavigation(role: UserRole | undefined) {
  return navigation
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          hasRole(role ? { role } : undefined, item.roles) &&
          !(
            role === "ADMIN" &&
            group.label === undefined &&
            (item.href === "/timetable" || item.href === "/exams")
          ),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

function roleLabel(role: string) {
  return role.toLowerCase().replaceAll("_", " ");
}

function initials(name: unknown) {
  const parts = (typeof name === "string" ? name : "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0] ?? "");
  return (letters.join("") || "U").toUpperCase();
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: user } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const groups = visibleNavigation(user?.role);
  const pageTitle =
    navigation
      .flatMap((group) => group.items)
      .find(
        (item) =>
          pathname === item.href || pathname.startsWith(`${item.href}/`),
      )?.label ?? "CIT Scheduler";

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/login");
    } catch (error) {
      showApiError(error);
    }
  };

  return (
    <div className="min-h-screen bg-app">
      <aside className="bg-sidebar-gradient fixed inset-y-0 left-0 z-30 hidden w-64 flex-col lg:flex">
        <SidebarBrand />
        <div className="sidebar-scroll flex-1 overflow-y-auto">
          <NavigationContent groups={groups} pathname={pathname} />
        </div>
        <SidebarFooter />
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-indigo-100/70 bg-white/80 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                className="inline-flex size-9 items-center justify-center rounded-lg text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent
                side="left"
                className="bg-sidebar-gradient w-72 border-0 p-0 text-indigo-100"
              >
                <SheetHeader className="p-0">
                  <SheetTitle className="sr-only">CIT Scheduler</SheetTitle>
                  <SidebarBrand />
                </SheetHeader>
                <NavigationContent
                  groups={groups}
                  pathname={pathname}
                  onNavigate={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>
            <div className="font-heading text-base font-bold tracking-tight">
              {pageTitle}
            </div>
          </div>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <span className="hidden text-right sm:block">
                  <span className="block max-w-40 truncate font-semibold">
                    {user.name}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 inline-block rounded-full border px-2 py-px text-[10px] font-semibold tracking-wide uppercase",
                      roleChip[user.role] ??
                        "border-slate-200 bg-slate-50 text-slate-600",
                    )}
                  >
                    {roleLabel(user.role)}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="bg-brand flex size-9 items-center justify-center rounded-full text-xs font-bold text-white shadow-md shadow-indigo-500/30"
                >
                  {initials(user.name)}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <span className="block truncate font-semibold">
                      {user.name}
                    </span>
                    <span
                      className={cn(
                        "mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize",
                        roleChip[user.role] ??
                          "border-slate-200 bg-slate-50 text-slate-600",
                      )}
                    >
                      {roleLabel(user.role)}
                    </span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handleSignOut()}>
                  <LogOut aria-hidden="true" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </header>
        <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
          {children}
        </main>
        {user ? <AssistantChat /> : null}
      </div>
    </div>
  );
}
