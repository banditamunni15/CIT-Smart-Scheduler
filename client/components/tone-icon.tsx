import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { toneStyles, type Tone } from "@/lib/tones";

export function ToneIcon({
  icon: Icon,
  tone = "indigo",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
        toneStyles[tone].chip,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-5" />
    </span>
  );
}
