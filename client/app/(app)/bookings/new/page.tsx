"use client";

import { useRouter } from "next/navigation";
import { BookingRequestForm } from "@/components/booking-request-form";
import { RequireRole } from "@/components/require-role";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/lib/session";
import { asRecord } from "@/lib/admin-data";

function NewBookingContent() {
  const router = useRouter();
  const { data: user } = useMe();
  const manualAllowed = user?.role === "ADMIN" || user?.role === "COORDINATOR";
  const complete = (result: unknown) => {
    const record = asRecord(result);
    if (typeof record.id === "string") {
      router.replace(`/bookings/${encodeURIComponent(record.id)}`);
    } else {
      router.replace("/bookings");
    }
  };
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New booking request</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Share the event details and acceptable schedule windows.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
      </header>
      {manualAllowed ? (
        <Tabs defaultValue="request">
          <TabsList>
            <TabsTrigger value="request">Request</TabsTrigger>
            <TabsTrigger value="manual">Place manually</TabsTrigger>
          </TabsList>
          <TabsContent value="request" className="mt-5">
            <BookingRequestForm key="request" mode="create" onComplete={complete} />
          </TabsContent>
          <TabsContent value="manual" className="mt-5">
            <BookingRequestForm key="manual" mode="manual" onComplete={complete} />
          </TabsContent>
        </Tabs>
      ) : (
        <BookingRequestForm mode="create" onComplete={complete} />
      )}
    </div>
  );
}

export default function NewBookingPage() {
  return <RequireRole roles={["ADMIN", "COORDINATOR", "FACULTY", "CLUB"]}><NewBookingContent /></RequireRole>;
}
