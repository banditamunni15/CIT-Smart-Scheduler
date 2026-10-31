"use client";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { get } from "./api";

export type UserRole = "ADMIN" | "COORDINATOR" | "FACULTY" | "CLUB";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string | null;
  facultyId: string | null;
  clubName: string | null;
  [key: string]: unknown;
};

type MeResponse = SessionUser;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, error) =>
              count < 1 &&
              !(error instanceof Error && "statusCode" in error),
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => get<MeResponse>("/api/me"),
    retry: false,
  });
}

export function hasRole(
  user: Pick<SessionUser, "role"> | null | undefined,
  roles: readonly UserRole[],
): boolean {
  return user !== null && user !== undefined && roles.includes(user.role);
}
