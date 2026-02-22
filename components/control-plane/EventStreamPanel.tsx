"use client"

import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useGovernanceStore } from "@/store/governance-store"

const severityClass: Record<string, string> = {
  info: "text-muted-foreground",
  warn: "text-amber-600",
  error: "text-red-600",
  critical: "text-red-700 font-semibold",
}

export function EventStreamPanel() {
  const events = useGovernanceStore((s) => s.events)

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">Event Stream</h2>
      <Separator className="my-4" />
      <ScrollArea className="h-[320px]">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className={severityClass[event.severity] ?? severityClass.info}>
                    {event.severity.toUpperCase()} · {event.type}
                  </span>
                  <span className="text-muted-foreground">{event.timestamp}</span>
                </div>
                <div className="mt-1">{event.message}</div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  )
}
