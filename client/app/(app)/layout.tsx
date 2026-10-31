import type { ReactNode } from "react";
import { AppAuthGuard } from "@/components/app-auth-guard";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppAuthGuard>{children}</AppAuthGuard>;
}
