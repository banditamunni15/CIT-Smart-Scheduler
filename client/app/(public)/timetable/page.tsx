"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { ApiClientError, get } from "@/lib/api";
import {
  normalizePublicGroups,
  normalizePublicRooms,
  type PublicOption,
} from "@/lib/public-data";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { TableSkeleton } from "@/components/table-skeleton";
import { TimetableGrid } from "@/components/timetable-grid";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

function TimetablePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "room" ? "room" : "group";
  const groupId = searchParams.get("group") ?? "";
  const roomId = searchParams.get("room") ?? "";

  const groups = useQuery({
    queryKey: ["public", "groups"],
    queryFn: async () => normalizePublicGroups(await get<unknown>("/api/public/groups")),
  });

  const groupView = useQuery({
    queryKey: ["public", "timetable", "group", groupId],
    queryFn: () =>
      get<unknown[]>(`/api/public/timetable/group/${encodeURIComponent(groupId)}`),
    enabled: mode === "group" && Boolean(groupId),
  });

  const roomLists = useQueries({
    queries: (groups.data ?? []).map((group: PublicOption) => ({
      queryKey: ["public", "room-options", group.id],
      queryFn: () =>
        get<unknown[]>(
          `/api/public/timetable/group/${encodeURIComponent(group.id)}`,
        ),
      enabled: mode === "room",
      retry: false,
    })),
  });
  const rooms = useMemo(
    () => normalizePublicRooms(roomLists.flatMap((query) => query.data ?? [])),
    [roomLists],
  );
  const roomView = useQuery({
    queryKey: ["public", "timetable", "room", roomId],
    queryFn: () =>
      get<unknown[]>(`/api/public/timetable/room/${encodeURIComponent(roomId)}`),
    enabled: mode === "room" && Boolean(roomId),
  });

  const updateQuery = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      const suffix = params.toString();
      router.replace(suffix ? `${pathname}?${suffix}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (mode === "group" && !groupId && groups.data?.length) {
      updateQuery("group", groups.data[0].id);
    }
    if (mode === "room" && !roomId && rooms.length) {
      updateQuery("room", rooms[0].id);
    }
  }, [groupId, groups.data, mode, roomId, rooms, updateQuery]);

  const selectedData = mode === "group" ? groupView : roomView;
  const selectedError = selectedData.error;
  const publishedTimetableMissing =
    selectedError instanceof ApiClientError &&
    selectedError.code === "NO_PUBLISHED_TIMETABLE";
  const missingPublishedForRoomChoices = roomLists.some(
    (query) =>
      query.error instanceof ApiClientError &&
      query.error.code === "NO_PUBLISHED_TIMETABLE",
  );
  const genericRoomChoicesError = roomLists.find(
    (query) => query.isError && !(query.error instanceof ApiClientError &&
      query.error.code === "NO_PUBLISHED_TIMETABLE"),
  );
  const selectingRoomOptionsLoading =
    mode === "room" &&
    (groups.isPending || roomLists.some((query) => query.isPending));
  const options = mode === "group" ? groups.data ?? [] : rooms;
  const selectedId = mode === "group" ? groupId : roomId;

  const changeMode = (value: string | null) => {
    if (!value) return;
    updateQuery("mode", value === "room" ? "room" : "");
  };
  const retryOptions = () => {
    void groups.refetch();
    roomLists.forEach((query) => void query.refetch());
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Timetable</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse the published schedule by group or room.
        </p>
      </div>
      <Tabs value={mode} onValueChange={changeMode}>
        <TabsList aria-label="Timetable view">
          <TabsTrigger value="group">By group</TabsTrigger>
          <TabsTrigger value="room">By room</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="max-w-sm space-y-2">
        <label className="text-sm font-medium">
          {mode === "group" ? "Group" : "Room"}
        </label>
        {groups.isPending || selectingRoomOptionsLoading ? (
          <TableSkeleton rows={1} columns={1} />
        ) : groups.isError ? (
          <ErrorState error={groups.error} onRetry={() => void groups.refetch()} />
        ) : genericRoomChoicesError ? (
          <ErrorState
            error={genericRoomChoicesError.error}
            onRetry={retryOptions}
          />
        ) : options.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            description={
              mode === "group"
                ? "No groups are available to browse."
                : "No rooms appear in the published timetable."
            }
            action={<Button variant="outline" onClick={retryOptions}>Retry</Button>}
          />
        ) : (
          <Select
            value={selectedId || null}
            onValueChange={(value) => updateQuery(mode, value ?? "")}
          >
            <SelectTrigger aria-label={mode === "group" ? "Select group" : "Select room"}>
              <SelectValue placeholder={`Select ${mode}`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option: PublicOption | { id: string }) => (
                <SelectItem key={option.id} value={option.id}>
                  {"label" in option ? option.label : option.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {publishedTimetableMissing || (mode === "room" && missingPublishedForRoomChoices) ? (
        <EmptyState
          icon={CalendarDays}
          title="No timetable has been published yet."
          description="A published timetable will appear here when it is available."
          action={<Button variant="outline" onClick={() => router.refresh()}>Refresh</Button>}
        />
      ) : selectedData.isPending && Boolean(selectedId) ? (
        <TableSkeleton rows={6} columns={5} />
      ) : selectedData.isError ? (
        <ErrorState
          error={selectedData.error}
          onRetry={() => void selectedData.refetch()}
        />
      ) : selectedData.data ? (
        selectedData.data.length ? (
          <TimetableGrid entries={selectedData.data} mode={mode} />
        ) : (
          <EmptyState
            icon={CalendarDays}
            description={`No timetable entries are available for this ${mode}.`}
            action={<Button variant="outline" onClick={() => router.refresh()}>Refresh</Button>}
          />
        )
      ) : null}
    </div>
  );
}

export default function TimetablePage() {
  return (
    <Suspense fallback={<TableSkeleton rows={6} columns={5} />}>
      <TimetablePageContent />
    </Suspense>
  );
}
