"use client";

import { useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { showApiError } from "@/lib/errors";

type ConfirmDialogProps = {
  trigger: ReactElement;
  title: string;
  description: string;
  confirmLabel?: string;
  typeToConfirm?: string;
  onConfirm: () => void | Promise<unknown>;
};

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Continue",
  typeToConfirm,
  onConfirm,
}: ConfirmDialogProps) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const canConfirm = !typeToConfirm || value === typeToConfirm;
  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch (error) {
      showApiError(error);
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setValue("");
      }}
    >
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {typeToConfirm ? (
          <div className="space-y-2">
            <label htmlFor="confirm-value" className="text-sm font-medium">
              Type <span className="font-semibold">{typeToConfirm}</span> to
              confirm
            </label>
            <Input
              id="confirm-value"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setOpen(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || !canConfirm}
            render={<Button disabled={pending || !canConfirm} />}
            onClick={(event) => {
              event.preventDefault();
              if (!canConfirm || pending) return;
              void confirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
