"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu, ChevronDown, LogOut } from "lucide-react";
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
    <nav aria-label="Main navigation" className="space-y-5 px-3 py-4">
      {groups.map((group, groupIndex) => (
        <div key={group.label ?? `group-${groupIndex}`}>
          {group.label ? (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                  className={`flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon aria-hidden="true" className="size-4" />
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

function visibleNavigation(role: UserRole | undefined) {
  return navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        hasRole(role ? { role } : undefined, item.roles) &&
        !(role === "ADMIN" && group.label === undefined &&
          (item.href === "/timetable" || item.href === "/exams")),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

function roleLabel(role: string) {
  return role.toLowerCase().replaceAll("_", " ");
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
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-card lg:block">
        <Link
          href="/dashboard"
          className="flex h-14 items-center border-b px-5 text-sm font-semibold tracking-tight"
        >
          CIT Scheduler
        </Link>
        <NavigationContent groups={groups} pathname={pathname} />
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="size-4" />
              </SheetTrigger>
              <SheetContent side="left" className="p-0">
                <SheetHeader className="border-b px-5 py-4">
                  <SheetTitle>CIT Scheduler</SheetTitle>
                </SheetHeader>
                <NavigationContent
                  groups={groups}
                  pathname={pathname}
                  onNavigate={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>
            <div className="text-sm font-medium">{pageTitle}</div>
          </div>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <span className="hidden text-right sm:block">
                  <span className="block max-w-40 truncate font-medium">
                    {user.name}
                  </span>
                  <span className="block text-xs capitalize text-muted-foreground">
                    {roleLabel(user.role)}
                  </span>
                </span>
                <ChevronDown aria-hidden="true" className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <span className="block truncate">{user.name}</span>
                    <span className="mt-1 inline-block rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-600">
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
      </div>
    </div>
  );
}
