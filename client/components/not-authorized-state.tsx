import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotAuthorizedState() {
  return (
    <div className="mx-auto flex min-h-72 max-w-lg flex-col items-center justify-center text-center">
      <ShieldAlert className="mb-4 size-9 text-muted-foreground" />
      <h1 className="text-xl font-semibold tracking-tight">Not authorized</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your account does not have access to this page.
      </p>
      <Button nativeButton={false} render={<Link href="/dashboard" />} className="mt-5">
        Return to dashboard
      </Button>
    </div>
  );
}
