import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

type Look = { pill: string; dot: string; pulse?: boolean };

const emerald: Look = {
  pill: "border-emerald-200 bg-emerald-50 text-emerald-700",
  dot: "bg-emerald-500",
};
const amber: Look = {
  pill: "border-amber-200 bg-amber-50 text-amber-700",
  dot: "bg-amber-500",
};
const sky: Look = {
  pill: "border-sky-200 bg-sky-50 text-sky-700",
  dot: "bg-sky-500",
};
const violet: Look = {
  pill: "border-violet-200 bg-violet-50 text-violet-700",
  dot: "bg-violet-500",
};
const indigo: Look = {
  pill: "border-indigo-200 bg-indigo-50 text-indigo-700",
  dot: "bg-indigo-500",
};
const rose: Look = {
  pill: "border-rose-200 bg-rose-50 text-rose-700",
  dot: "bg-rose-500",
};
const slate: Look = {
  pill: "border-slate-200 bg-slate-50 text-slate-600",
  dot: "bg-slate-400",
};

const statusLook: Record<string, Look> = {
  APPROVED: emerald,
  PUBLISHED: emerald,
  SUCCEEDED: emerald,
  SUBMITTED: amber,
  PENDING: amber,
  PENDING_ADMIN: amber,
  PROPOSED: amber,
  QUEUED: amber,
  RUNNING: { ...sky, pulse: true },
  DRAFT: violet,
  DEPT_APPROVED: indigo,
  ALTERNATIVE_OFFERED: sky,
  REJECTED: rose,
  FAILED: rose,
  IMPOSSIBLE: rose,
  CANCELLED: slate,
  ARCHIVED: slate,
  WITHDRAWN: slate,
};

const statusLabel: Record<string, string> = {
  DEPT_APPROVED: "Department approved",
  ALTERNATIVE_OFFERED: "Alternative offered",
  QUEUED: "Queued",
};

export function StatusBadge({ status }: { status: string }) {
  const look = statusLook[status] ?? slate;
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", look.pill)}>
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          look.dot,
          look.pulse && "animate-pulse",
        )}
      />
      {statusLabel[status] ??
        status
          .toLowerCase()
          .replaceAll("_", " ")
          .replace(/^\w/, (c) => c.toUpperCase())}
    </Badge>
  );
}
