import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <p className="text-sm font-semibold text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page you are looking for does not exist or has moved.
      </p>
      <Button nativeButton={false} render={<Link href="/" />} className="mt-5">
        Go home
      </Button>
    </main>
  );
}
