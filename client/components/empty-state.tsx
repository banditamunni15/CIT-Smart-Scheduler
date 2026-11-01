import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title?: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({
  icon: Icon,
  title = "Nothing here yet",
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-linear-to-b from-indigo-50/60 to-card px-6 py-10 text-center">
      <div className="relative mb-3">
        <Image
          src="/illustrations/graduation.svg"
          alt=""
          width={84}
          height={84}
          unoptimized
          aria-hidden="true"
        />
        <span className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full bg-white text-indigo-600 shadow-md ring-1 ring-indigo-100">
          <Icon aria-hidden="true" className="size-4" />
        </span>
      </div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
