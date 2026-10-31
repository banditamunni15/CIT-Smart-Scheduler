"use client";

import type { ReactNode } from "react";
import { useMe, hasRole, type UserRole } from "@/lib/session";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { NotAuthorizedState } from "@/components/not-authorized-state";

export function RequireRole({
  roles,
  children,
}: {
  roles: readonly UserRole[];
  children: ReactNode;
}) {
  const query = useMe();
  if (query.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (!hasRole(query.data, roles)) return <NotAuthorizedState />;
  return children;
}
