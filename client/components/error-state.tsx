"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { friendlyErrorText } from "@/lib/errors";

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive" className="bg-card">
      <AlertCircle />
      <AlertTitle>Unable to load this view</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{friendlyErrorText(error)}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="border-destructive/30"
        >
          <RefreshCw />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}
