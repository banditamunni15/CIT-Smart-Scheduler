"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Save } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post, put } from "@/lib/api";
import { RequireRole } from "@/components/require-role";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { TableSkeleton } from "@/components/table-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function SortablePriorityItem({
  value,
  index,
}: {
  value: string;
  index: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: value });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex h-12 items-center gap-3 rounded-md border bg-card px-3 ${
        isDragging ? "z-10 opacity-70 shadow-xs" : ""
      }`}
    >
      <button
        type="button"
        aria-label={`Reorder ${value}`}
        className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-7 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SettingsContent() {
  const client = useQueryClient();
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const orderQuery = useQuery({
    queryKey: ["admin", "settings", "priority-order"],
    queryFn: () => get<unknown>("/api/settings/priority-order"),
  });
  const priorityOrder = draftOrder ?? (
    Array.isArray(orderQuery.data)
      ? orderQuery.data.filter((value): value is string => typeof value === "string")
      : []
  );
  const changed = draftOrder !== null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const save = useMutation({
    mutationFn: () =>
      put("/api/settings/priority-order", { priority_order: priorityOrder }),
    onSuccess: async () => {
      setDraftOrder(null);
      await client.invalidateQueries({ queryKey: ["admin", "settings", "priority-order"] });
    },
  });
  const reset = useMutation({
    mutationFn: () => post("/api/admin/reset-demo", { confirm: true }),
    onSuccess: async () => {
      await client.invalidateQueries();
    },
  });

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = priorityOrder.indexOf(String(active.id));
    const to = priorityOrder.indexOf(String(over.id));
    if (from >= 0 && to >= 0) setDraftOrder(arrayMove(priorityOrder, from, to));
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure scheduling priority and demo data.
        </p>
      </header>

      <Card className="border border-border shadow-xs">
        <CardHeader>
          <CardTitle>Priority order</CardTitle>
          <CardDescription>
            Drag items to change the order used by the scheduling engine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {orderQuery.isPending ? (
            <TableSkeleton rows={5} columns={1} />
          ) : orderQuery.isError ? (
            <ErrorState error={orderQuery.error} onRetry={() => void orderQuery.refetch()} />
          ) : priorityOrder.length === 0 ? (
            <EmptyState
              icon={GripVertical}
              description="No priority values are configured."
            />
          ) : (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext items={priorityOrder} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {priorityOrder.map((value, index) => (
                      <SortablePriorityItem key={value} value={value} index={index} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <Button
                onClick={() => save.mutate()}
                disabled={!changed || save.isPending}
              >
                <Save aria-hidden="true" />
                {save.isPending ? "Saving…" : "Save priority order"}
              </Button>
            </>
          )}
          {save.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to save priority order</AlertTitle>
              <AlertDescription>{save.error.message}</AlertDescription>
            </Alert>
          ) : null}
          {save.isSuccess ? (
            <p className="text-sm text-green-700" role="status">Priority order saved.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border border-border shadow-xs">
        <CardHeader>
          <CardTitle>Demo data</CardTitle>
          <CardDescription>
            Restore the application’s demo datasets and scheduling records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ConfirmDialog
            trigger={
              <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10">
                Reset demo
              </Button>
            }
            title="Reset demo data?"
            description="This replaces current demo scheduling data. This action cannot be undone."
            confirmLabel={reset.isPending ? "Resetting…" : "Reset demo"}
            typeToConfirm="RESET"
            onConfirm={() => reset.mutateAsync()}
          />
          {reset.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Demo reset failed</AlertTitle>
              <AlertDescription>{reset.error.message}</AlertDescription>
            </Alert>
          ) : null}
          {reset.isSuccess ? (
            <p className="text-sm text-muted-foreground" role="status">Demo data was reset.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminSettingsPage() {
  return <RequireRole roles={["ADMIN"]}><SettingsContent /></RequireRole>;
}
