import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b bg-card">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            CIT Scheduler
          </Link>
          <Button nativeButton={false} render={<Link href="/login" />}>Sign in</Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
