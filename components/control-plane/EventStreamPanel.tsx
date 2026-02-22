"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Select } from "@/components/ui/select"
import { useGovernanceStore } from "@/store/governance-store"
import type { GovernanceEvent } from "@/lib/governance/schema"

const severityClass: Record<string, string> = {
  info: "text-muted-foreground",
  warn: "text-amber-600",
  error: "text-red-600",
  critical: "text-red-700 font-semibold",
}

const ALL = "__all__"

const TIME_WINDOWS = [
  { label: "All", ms: 0 },
  { label: "Last 5m", ms: 5 * 60_000 },
  { label: "Last 15m", ms: 15 * 60_000 },
  { label: "Last 1h", ms: 60 * 60_000 },
]

interface EventStreamPanelProps {
  fullPage?: boolean
}

export function EventStreamPanel({ fullPage = false }: EventStreamPanelProps) {
  const events = useGovernanceStore((s) => s.events)

  const [severityFilter, setSeverityFilter] = useState(ALL)
  const [typeFilter, setTypeFilter] = useState(ALL)
  const [agentFilter, setAgentFilter] = useState(ALL)
  const [searchQuery, setSearchQuery] = useState("")
  const [timeWindow, setTimeWindow] = useState(0)

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
    const lowerQuery = searchQuery.toLowerCase()
    return events.filter((e: GovernanceEvent) => {
      if (severityFilter !== ALL && e.severity !== severityFilter) return false
      if (typeFilter !== ALL && e.type !== typeFilter) return false
      if (agentFilter !== ALL && e.agentId !== agentFilter) return false
      if (lowerQuery && !e.message.toLowerCase().includes(lowerQuery)) return false
      if (timeWindow > 0) {
        const ts = Date.parse(e.timestamp)
        if (Number.isFinite(ts) && ts < now - timeWindow) return false
      }
      return true
    }).reverse()
  }, [events, severityFilter, typeFilter, agentFilter, searchQuery, timeWindow])

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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 h-8 text-xs"
            />
            <Select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-28 h-8 text-xs"
            >
              <option value={ALL}>All severity</option>
              {severities.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-36 h-8 text-xs"
            >
              <option value={ALL}>All types</option>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
            <Select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="w-40 h-8 text-xs"
            >
              <option value={ALL}>All agents</option>
              {agentIds.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
            <div className="flex gap-1">
              {TIME_WINDOWS.map((tw) => (
                <button
                  key={tw.ms}
                  onClick={() => setTimeWindow(tw.ms)}
                  className={`px-2 py-1 rounded text-xs border transition-colors ${
                    timeWindow === tw.ms
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

      <ScrollArea className={fullPage ? "h-[600px]" : "h-[320px]"}>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events match filters.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((event) => (
              <div key={event.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={severityClass[event.severity] ?? severityClass.info}>
                      {event.severity.toUpperCase()}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {event.type}
                    </Badge>
                    {event.agentId && (
                      <span className="text-muted-foreground">{event.agentId}</span>
                    )}
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="mt-1">{event.message}</div>
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
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  )
}
