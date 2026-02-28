"use client"

import { useMemo, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Select } from "@/components/ui/select"
import { useGovernanceStore } from "@/store/governance-store"
import { useFilters, TIME_RANGES } from "@/store/filter-store"
import type { GovernanceEvent } from "@/lib/governance/schema"

const severityClass: Record<string, string> = {
  info: "text-muted-foreground",
  warn: "text-amber-600",
  error: "text-red-600",
  critical: "text-red-700 font-semibold",
}

const eventTypeBadgeClass: Record<string, string> = {
  suppression: "border-red-300 bg-red-50 text-red-700",
  restoration: "border-green-300 bg-green-50 text-green-700",
  mediation_decision: "border-blue-300 bg-blue-50 text-blue-700",
}

const ALL = ""

interface EventStreamPanelProps {
  fullPage?: boolean
}

export function EventStreamPanel({ fullPage = false }: EventStreamPanelProps) {
  const events = useGovernanceStore((s) => s.events)
  const filters = useFilters()
  const scrollRef = useRef<HTMLDivElement>(null)

  const severities = useMemo(
    () => [...new Set(events.map((e) => e.severity))].sort(),
    [events],
  )
  const types = useMemo(
    () => [...new Set(events.map((e) => e.type))].sort(),
    [events],
  )
  const agentIds = useMemo(
    () => [...new Set(events.map((e) => e.agentId).filter(Boolean) as string[])].sort(),
    [events],
  )

  const filtered = useMemo(() => {
    const now = Date.now()
    const searchQuery = filters.q
    const q = searchQuery.trim().toLowerCase()

    const matchesQuery = (evt: GovernanceEvent) => {
      if (!q) return true
      const haystack = [
        evt.message ?? "",
        evt.type ?? "",
        evt.agentId ?? "",
        ...(evt.tags ?? []),
        JSON.stringify(evt.metadata ?? {}),
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    }

    return events.filter((e: GovernanceEvent) => {
      if (filters.severity && e.severity !== filters.severity) return false
      if (filters.eventType && e.type !== filters.eventType) return false
      if (filters.agentId && e.agentId !== filters.agentId) return false
      if (!matchesQuery(e)) return false
      if (filters.timeRange > 0) {
        const ts = Date.parse(e.timestamp)
        if (Number.isFinite(ts) && ts < now - filters.timeRange) return false
      }
      return true
    }).reverse()
  }, [events, filters.severity, filters.eventType, filters.agentId, filters.q, filters.timeRange])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    overscan: 10,
  })

  const showFilters = fullPage

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold">Event Stream</h2>
        <span className="text-xs text-muted-foreground">
          {filtered.length} / {events.length} events
        </span>
      </div>

      {showFilters && (
        <>
          <Separator className="my-3" />
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Input
              placeholder="Search messages..."
              value={filters.q}
              onChange={(e) => filters.setSearch(e.target.value)}
              className="w-48 h-8 text-xs"
            />
            <Select
              value={filters.severity}
              onChange={(e) => filters.setSeverity(e.target.value)}
              className="w-28 h-8 text-xs"
            >
              <option value={ALL}>All severity</option>
              {severities.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
            <Select
              value={filters.eventType}
              onChange={(e) => filters.setEventType(e.target.value)}
              className="w-36 h-8 text-xs"
            >
              <option value={ALL}>All types</option>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
            <Select
              value={filters.agentId}
              onChange={(e) => filters.setAgentId(e.target.value)}
              className="w-40 h-8 text-xs"
            >
              <option value={ALL}>All agents</option>
              {agentIds.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
            <div className="flex gap-1">
              {TIME_RANGES.map((tw) => (
                <button
                  key={tw.ms}
                  onClick={() => filters.setTimeRange(tw.ms)}
                  className={`px-2 py-1 rounded text-xs border transition-colors ${
                    filters.timeRange === tw.ms
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {tw.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <Separator className="my-3" />

      <div
        ref={scrollRef}
        className={`overflow-y-auto ${fullPage ? "h-[600px]" : "h-[320px]"}`}
      >
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events match filters.</p>
        ) : (
          <div
            style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const event = filtered[virtualRow.index]
              const actor =
                event.metadata?.actor && typeof event.metadata.actor === "object"
                  ? event.metadata.actor as { user_id?: unknown; role?: unknown }
                  : null
              const actorUserId = typeof actor?.user_id === "string" ? actor.user_id : null
              const actorRole = typeof actor?.role === "string" ? actor.role : null
              const requestId =
                typeof event.metadata?.request_id === "string" ? event.metadata.request_id : null

              return (
                <div
                  key={event.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="pb-2"
                >
                  <div className="rounded-md border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={severityClass[event.severity] ?? severityClass.info}>
                          {event.severity.toUpperCase()}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${eventTypeBadgeClass[event.type] ?? ""}`}
                        >
                          {event.type}
                        </Badge>
                        {event.agentId && (
                          <button
                            className="text-muted-foreground hover:text-foreground hover:underline"
                            onClick={() => filters.setAgentId(event.agentId!)}
                          >
                            {event.agentId}
                          </button>
                        )}
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="mt-1">{event.message}</div>
                    {typeof event.metadata?.selected_agent === "string" && typeof event.metadata?.selection_strategy === "string" && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        selected: {event.metadata.selected_agent} · strategy: {event.metadata.selection_strategy}
                      </div>
                    )}
                    {requestId && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        request_id: {requestId}
                      </div>
                    )}
                    {actorUserId && actorRole && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        actor: {actorUserId} ({actorRole})
                      </div>
                    )}
                    {event.tags && event.tags.length > 0 && (
                      <div className="mt-1 flex gap-1">
                        {event.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[9px] px-1 py-0">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}
