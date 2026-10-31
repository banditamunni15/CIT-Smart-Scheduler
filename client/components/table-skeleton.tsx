import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({
  rows = 6,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div
      aria-label="Loading table"
      className="overflow-hidden rounded-lg border bg-card"
    >
      <div className="flex h-10 items-center gap-4 border-b bg-muted/50 px-4">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={`head-${index}`} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex h-11 items-center gap-4 border-b px-4 last:border-b-0"
        >
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={`${row}-${column}`}
              className={`h-3 ${column === 0 ? "w-28" : "flex-1"}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
