import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/timetable", label: "Timetable" },
  { href: "/exams", label: "Exams" },
  { href: "/free-rooms", label: "Free rooms" },
];

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-app">
      <header className="sticky top-0 z-20 h-16 border-b border-indigo-100/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/illustrations/logo.svg"
              alt=""
              width={36}
              height={36}
              unoptimized
              aria-hidden="true"
              className="size-9 rounded-xl shadow-md shadow-indigo-500/30"
            />
            <span className="font-heading text-[15px] font-bold tracking-tight">
              CIT Scheduler
            </span>
          </Link>
          <nav aria-label="Public pages" className="hidden items-center gap-1 sm:flex">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-indigo-50 hover:text-indigo-700"
              >
                {label}
              </Link>
            ))}
          </nav>
          <Button nativeButton={false} render={<Link href="/login" />}>
            Sign in
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <footer className="border-t border-indigo-100/70 bg-white/60 py-5 text-center text-xs text-muted-foreground">
        Chilika Institute of Technology · Scheduling platform
      </footer>
    </div>
  );
}
