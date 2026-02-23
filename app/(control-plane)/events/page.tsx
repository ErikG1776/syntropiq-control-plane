"use client"

import { EventStreamPanel } from "@/components/control-plane/EventStreamPanel"
import { DataGuard } from "@/components/control-plane/DataGuard"

export default function EventsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-sm text-muted-foreground">
          Live governance event stream with filtering and search.
        </p>
      </div>

      <DataGuard emptyMessage="Connect a source to view the event stream.">
        <EventStreamPanel fullPage />
      </DataGuard>
    </div>
  )
}
