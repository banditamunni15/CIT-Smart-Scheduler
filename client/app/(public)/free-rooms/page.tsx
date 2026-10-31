"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { DoorOpen } from "lucide-react";
import { get } from "@/lib/api";
import { normalizeFreeRoom, type PublicRoom } from "@/lib/public-data";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { TableSkeleton } from "@/components/table-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const days = ["MON", "TUE", "WED", "THU", "FRI"];
const periods = Array.from({ length: 9 }, (_, index) => index + 1);
type RoomFilters = {
  day: string;
  period: number;
  capacity?: number;
  type?: string;
};

export default function FreeRoomsPage() {
  const [day, setDay] = useState("MON");
  const [period, setPeriod] = useState("1");
  const [capacity, setCapacity] = useState("");
  const [roomType, setRoomType] = useState("");
  const [filters, setFilters] = useState<RoomFilters | null>(null);

  const query = useQuery({
    queryKey: ["public", "free-rooms", filters],
    queryFn: async () => {
      if (!filters) return [];
      const params = new URLSearchParams({
        day: filters.day,
        period: String(filters.period),
      });
      if (filters.capacity !== undefined) {
        params.set("capacity", String(filters.capacity));
      }
      if (filters.type) params.set("type", filters.type);
      const result = await get<unknown>(`/api/public/free-rooms?${params}`);
      return Array.isArray(result)
        ? result.map(normalizeFreeRoom).filter((room): room is PublicRoom => room !== null)
        : [];
    },
    enabled: filters !== null,
  });

  const typeOptions = useMemo(
    () =>
      [...new Set((query.data ?? []).map((room) => room.type))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [query.data],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedCapacity = capacity.trim() ? Number(capacity) : undefined;
    if (
      parsedCapacity !== undefined &&
      (!Number.isInteger(parsedCapacity) || parsedCapacity < 0)
    ) {
      return;
    }
    setFilters({
      day,
      period: Number(period),
      ...(parsedCapacity === undefined ? {} : { capacity: parsedCapacity }),
      ...(roomType ? { type: roomType } : {}),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Free rooms</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find rooms available for a selected day and period.
        </p>
      </div>
      <form
        id="free-room-filters"
        onSubmit={submit}
        className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Day</label>
          <Select value={day} onValueChange={(value) => value && setDay(value)}>
            <SelectTrigger aria-label="Day">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {days.map((value) => (
                <SelectItem key={value} value={value}>{value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Period</label>
          <Select value={period} onValueChange={(value) => value && setPeriod(value)}>
            <SelectTrigger aria-label="Period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map((value) => (
                <SelectItem key={value} value={String(value)}>Period {value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label htmlFor="capacity" className="text-sm font-medium">
            Minimum capacity
          </label>
          <Input
            id="capacity"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="Any"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
          {capacity.trim() && (!Number.isInteger(Number(capacity)) || Number(capacity) < 0) ? (
            <p className="text-xs text-destructive">Enter a non-negative whole number.</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Room type</label>
          <Select
            value={roomType || "ALL"}
            onValueChange={(value) => setRoomType(value === "ALL" ? "" : value ?? "")}
          >
            <SelectTrigger aria-label="Room type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Any type</SelectItem>
              {typeOptions.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="submit"
          disabled={
            Boolean(capacity.trim()) &&
            (!Number.isInteger(Number(capacity)) || Number(capacity) < 0)
          }
        >
          Find rooms
        </Button>
      </form>

      {filters === null ? (
        <EmptyState
          icon={DoorOpen}
          title="Choose a time to find free rooms"
          description="Select a day and period, then search for rooms available at that time."
          action={
            <Button
              variant="outline"
              type="submit"
              form="free-room-filters"
              disabled={
                Boolean(capacity.trim()) &&
                (!Number.isInteger(Number(capacity)) || Number(capacity) < 0)
              }
            >
              Show available rooms
            </Button>
          }
        />
      ) : query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => <TableSkeleton key={item} rows={2} columns={1} />)}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          description="No rooms are available for the selected filters."
          action={<Button variant="outline" onClick={() => void query.refetch()}>Try again</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.map((room) => (
            <Card key={room.id} size="sm" className="border border-border shadow-xs">
              <CardHeader>
                <CardTitle className="text-sm">{room.id}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="mt-1 font-medium">{room.type}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Capacity</p>
                  <p className="mt-1 font-medium">{room.capacity ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
