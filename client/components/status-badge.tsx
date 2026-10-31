import { Badge } from "@/components/ui/badge";

const statusClass: Record<string, string> = {
  APPROVED: "border-green-200 bg-green-50 text-green-800",
  PUBLISHED: "border-green-200 bg-green-50 text-green-800",
  SUCCEEDED: "border-green-200 bg-green-50 text-green-800",
  SUBMITTED: "border-amber-200 bg-amber-50 text-amber-800",
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  PENDING_ADMIN: "border-amber-200 bg-amber-50 text-amber-800",
  DRAFT: "border-amber-200 bg-amber-50 text-amber-800",
  RUNNING: "border-amber-200 bg-amber-50 text-amber-800",
  QUEUED: "border-amber-200 bg-amber-50 text-amber-800",
  DEPT_APPROVED: "border-slate-200 bg-slate-50 text-slate-700",
  ALTERNATIVE_OFFERED: "border-slate-200 bg-slate-50 text-slate-700",
  REJECTED: "border-red-200 bg-red-50 text-red-800",
  FAILED: "border-red-200 bg-red-50 text-red-800",
  IMPOSSIBLE: "border-red-200 bg-red-50 text-red-800",
  CANCELLED: "border-gray-200 bg-gray-50 text-gray-600",
  ARCHIVED: "border-gray-200 bg-gray-50 text-gray-600",
  WITHDRAWN: "border-gray-200 bg-gray-50 text-gray-600",
  PROPOSED: "border-amber-200 bg-amber-50 text-amber-800",
};

const statusLabel: Record<string, string> = {
  DEPT_APPROVED: "Department approved",
  ALTERNATIVE_OFFERED: "Alternative offered",
  QUEUED: "Queued",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={statusClass[status] ?? "border-gray-200 bg-gray-50 text-gray-600"}
    >
      {statusLabel[status] ??
        status.toLowerCase().replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase())}
    </Badge>
  );
}
