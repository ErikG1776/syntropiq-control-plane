"use client"

import { EventStreamPanel } from "@/components/control-plane/EventStreamPanel"
import { Card } from "@/components/ui/card"
import { useGovernanceStore } from "@/store/governance-store"

export default function EventsPage() {
  const connected = useGovernanceStore((s) => s.connected)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-sm text-muted-foreground">
          Live governance event stream and severity telemetry.
        </p>
      </div>

      {!connected ? (
        <Card className="p-5 text-sm text-muted-foreground">
          Connect a source to view the event stream.
        </Card>
      ) : (
        <EventStreamPanel />
      )}
    </div>
  )
}
