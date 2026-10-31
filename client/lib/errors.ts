"use client";

import { createElement, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiClientError } from "./api";

const friendlyMessages: Record<string, string> = {
  UNAUTHORIZED: "Please sign in to continue.",
  FORBIDDEN: "You do not have permission to do that.",
  VALIDATION_ERROR: "Check the information and try again.",
  SCHEDULE_RULE_VIOLATION: "This change conflicts with scheduling rules.",
  STALE_STATE: "This changed while you were working. Refresh and try again.",
  SELF_APPROVAL_NOT_ALLOWED: "A different reviewer must approve this request.",
  NO_ACTIVE_DATASET: "There is no active scheduling dataset.",
  NO_PUBLISHED_TIMETABLE: "There is no published timetable yet.",
  NO_PUBLISHED_EXAMS: "There is no published exam schedule yet.",
  ENGINE_UNAVAILABLE: "The scheduling service is temporarily unavailable.",
  TOO_MANY_REQUESTS: "Too many requests. Wait a moment and try again.",
  NOT_FOUND: "The requested item could not be found.",
};

const formatDetails = (details: unknown): string => {
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
};

const ErrorDetails = ({ details }: { details: unknown }) =>
  createElement(
    "details",
    { className: "mt-2 text-left" },
    createElement(
      "summary",
      { className: "cursor-pointer underline underline-offset-2" },
      "View scheduling details",
    ),
    createElement(
      "pre",
      {
        className:
          "mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs",
      },
      formatDetails(details),
    ),
  );

export const friendlyErrorText = (error: unknown): string => {
  if (error instanceof ApiClientError) {
    return (
      friendlyMessages[error.code] ??
      error.message ??
      "Something went wrong. Please try again."
    );
  }
  return "Something went wrong. Please try again.";
};

export function showApiError(error: unknown): void {
  const message = friendlyErrorText(error);
  const details =
    error instanceof ApiClientError ? error.details : undefined;
  const description: ReactNode =
    error instanceof ApiClientError &&
    error.code === "SCHEDULE_RULE_VIOLATION" && details !== undefined
      ? createElement(ErrorDetails, { details })
      : undefined;
  toast.error(message, { description });
}
