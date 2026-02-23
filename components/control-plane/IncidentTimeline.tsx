"use client"

import { useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useGovernanceStore } from "@/store/governance-store"
import { useFilters } from "@/store/filter-store"
import type { GovernanceEvent } from "@/lib/governance/schema"

const INCIDENT_TYPES = new Set([
  "suppression",
  "threshold_breach",
  "routing_freeze",
  "probation",
])

interface Incident {
  id: string
  type: string
  startTs: string
  endTs: string | null
  severity: GovernanceEvent["severity"]
  agentId: string | undefined
  events: GovernanceEvent[]
  message: string
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  error: 1,
  warn: 2,
  info: 3,
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-700",
  error: "bg-red-500",
  warn: "bg-amber-500",
  info: "bg-blue-500",
}

const TYPE_COLORS: Record<string, string> = {
  suppression: "bg-red-600",
  threshold_breach: "bg-orange-500",
  routing_freeze: "bg-purple-500",
  probation: "bg-amber-500",
}

export function IncidentTimeline() {
  const events = useGovernanceStore((s) => s.events)
  const filters = useFilters()

  // Group incident events into spans
  const incidents = useMemo(() => {
    const incidentEvents = events.filter((e) => INCIDENT_TYPES.has(e.type))

    // Group by agentId + type to create incident spans
    const grouped = new Map<string, GovernanceEvent[]>()
    for (const evt of incidentEvents) {
      const key = `${evt.agentId ?? "system"}_${evt.type}`
      const group = grouped.get(key) ?? []
      group.push(evt)
      grouped.set(key, group)
    }

    const result: Incident[] = []
    for (const [, group] of grouped) {
      const sorted = [...group].sort(
        (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
      )
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const worstSeverity = sorted.reduce(
        (worst, e) =>
          (SEVERITY_ORDER[e.severity] ?? 3) < (SEVERITY_ORDER[worst] ?? 3)
            ? e.severity
            : worst,
        "info" as GovernanceEvent["severity"],
      )

      result.push({
        id: `incident_${first.id}`,
        type: first.type,
        startTs: first.timestamp,
        endTs: sorted.length > 1 ? last.timestamp : null,
        severity: worstSeverity,
        agentId: first.agentId,
        events: sorted,
        message: first.message,
      })
    }

    return result.sort(
      (a, b) => Date.parse(b.startTs) - Date.parse(a.startTs),
    )
  }, [events])

  // Apply filters
  const filtered = useMemo(() => {
    return incidents.filter((inc) => {
      if (filters.agentId && inc.agentId !== filters.agentId) return false
      if (filters.severity && inc.severity !== filters.severity) return false
      if (filters.eventType && inc.type !== filters.eventType) return false
      if (filters.timeRange > 0) {
        const ts = Date.parse(inc.startTs)
        if (Number.isFinite(ts) && ts < Date.now() - filters.timeRange) return false
      }
      return true
    })
  }, [incidents, filters.agentId, filters.severity, filters.eventType, filters.timeRange])

  // Compute timeline bounds
  const { minTs, maxTs } = useMemo(() => {
    if (filtered.length === 0) return { minTs: 0, maxTs: 1 }
    const timestamps = filtered.flatMap((inc) => [
      Date.parse(inc.startTs),
      inc.endTs ? Date.parse(inc.endTs) : Date.parse(inc.startTs),
    ])
    const min = Math.min(...timestamps)
    const max = Math.max(...timestamps)
    return { minTs: min, maxTs: max === min ? min + 1000 : max }
  }, [filtered])

  const totalRange = maxTs - minTs

  if (incidents.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">
          No incidents recorded. Incidents appear when suppressions, threshold breaches, or routing freezes occur.
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Incident Timeline</h2>
        <span className="text-xs text-muted-foreground">
          {filtered.length} incident{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Timeline visualization */}
      <div className="mb-6 rounded border p-4">
        <div className="relative h-40 overflow-x-auto">
          {/* Time axis */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-border" />
          <div className="absolute bottom-0 left-0 text-[9px] text-muted-foreground">
            {new Date(minTs).toLocaleTimeString()}
          </div>
          <div className="absolute bottom-0 right-0 text-[9px] text-muted-foreground">
            {new Date(maxTs).toLocaleTimeString()}
          </div>

          {/* Incident spans */}
          {filtered.map((inc, i) => {
            const startPct =
              ((Date.parse(inc.startTs) - minTs) / totalRange) * 100
            const endPct = inc.endTs
              ? ((Date.parse(inc.endTs) - minTs) / totalRange) * 100
              : startPct + 1
            const width = Math.max(endPct - startPct, 1)
            const row = i % 4
            const top = 8 + row * 28

            return (
              <div
                key={inc.id}
                className={`absolute rounded-sm ${TYPE_COLORS[inc.type] ?? "bg-gray-500"} opacity-80 hover:opacity-100 transition-opacity cursor-default`}
                style={{
                  left: `${startPct}%`,
                  width: `${width}%`,
                  minWidth: "8px",
                  top: `${top}px`,
                  height: "22px",
                }}
                title={`${inc.type} — ${inc.agentId ?? "system"} — ${inc.message}`}
              >
                <div className="px-1 truncate text-[9px] text-white leading-[22px]">
                  {inc.agentId ?? inc.type}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3 text-xs">
          {Object.entries(TYPE_COLORS).map(([type, cls]) => (
            <div key={type} className="flex items-center gap-1">
              <div className={`w-3 h-2 rounded-sm ${cls}`} />
              <span className="text-muted-foreground">{type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Incident list */}
      <ScrollArea className="h-[360px]">
        <div className="space-y-2">
          {filtered.map((inc) => (
            <details
              key={inc.id}
              className="rounded border group"
            >
              <summary className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      inc.severity === "critical" || inc.severity === "error"
                        ? "destructive"
                        : "secondary"
                    }
                    className="text-[10px] px-1.5 py-0"
                  >
                    {inc.type}
                  </Badge>
                  {inc.agentId && (
                    <span className="text-xs text-muted-foreground">
                      {inc.agentId}
                    </span>
                  )}
                  <span className="text-xs truncate max-w-[300px]">
                    {inc.message}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {inc.events.length} event{inc.events.length > 1 ? "s" : ""}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(inc.startTs).toLocaleTimeString()}
                  </span>
                </div>
              </summary>
              <div className="px-3 pb-3 pt-1 space-y-1 border-t">
                {inc.events.map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-center justify-between text-xs py-1"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${SEVERITY_COLORS[evt.severity] ?? "bg-gray-400"}`}
                      />
                      <span>{evt.message}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </ScrollArea>
    </Card>
  )
}
