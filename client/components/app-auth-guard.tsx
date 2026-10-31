"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError } from "@/lib/api";
import { useMe } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";

export function AppAuthGuard({ children }: { children: React.ReactNode }) {
  const query = useMe();
  const router = useRouter();
  const unauthorized =
    query.error instanceof ApiClientError &&
    query.error.statusCode === 401;

  useEffect(() => {
    if (unauthorized) router.replace("/login");
  }, [router, unauthorized]);

  if (query.isPending || unauthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-3xl space-y-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
