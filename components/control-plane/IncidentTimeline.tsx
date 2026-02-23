"use client"

import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { GovernanceEvent, GovernanceEventType, GovernanceSnapshot } from "@/lib/governance/schema"

interface IncidentTimelineProps {
  events: GovernanceEvent[]
  history: GovernanceSnapshot[]
}

interface IncidentSpan {
  incidentStartCycle: number
  incidentEndCycle: number
  affectedAgents: string[]
  mutationOccurred: boolean
  eventTypes: GovernanceEventType[]
}

interface CycleBucket {
  cycleId: number
  events: GovernanceEvent[]
}

const INCIDENT_TYPES = new Set<GovernanceEventType>([
  "suppression",
  "routing_freeze",
  "threshold_breach",
  "mutation",
])

function parseCycleIdFromMetadata(evt: GovernanceEvent): number | undefined {
  const md = (evt.metadata ?? {}) as Record<string, unknown>
  const raw = md.cycleId ?? md.cycle ?? md.cycleNumber ?? md.sequence ?? md.frame
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string" && raw.trim().length > 0) {
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function groupEventsByCycle(
  events: GovernanceEvent[],
  history: GovernanceSnapshot[],
): CycleBucket[] {
  const timestampToCycle = new Map<string, number>()
  for (let i = 0; i < history.length; i += 1) {
    const snap = history[i]
    timestampToCycle.set(snap.timestamp, snap.sequence ?? i)
  }

  const uniqueTimestamps = Array.from(new Set(events.map((e) => e.timestamp))).sort((a, b) => {
    return Date.parse(a) - Date.parse(b)
  })
  const timestampFallbackCycle = new Map<string, number>()
  for (let i = 0; i < uniqueTimestamps.length; i += 1) {
    timestampFallbackCycle.set(uniqueTimestamps[i], i)
  }

  const buckets = new Map<number, GovernanceEvent[]>()
  for (const evt of events) {
    const cycleId =
      parseCycleIdFromMetadata(evt) ??
      timestampToCycle.get(evt.timestamp) ??
      timestampFallbackCycle.get(evt.timestamp)

    if (cycleId === undefined) continue
    const list = buckets.get(cycleId) ?? []
    list.push(evt)
    buckets.set(cycleId, list)
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([cycleId, grouped]) => ({ cycleId, events: grouped }))
}

function buildIncidentSpans(cycles: CycleBucket[]): IncidentSpan[] {
  const spans: IncidentSpan[] = []
  let openSpan: IncidentSpan | null = null
  let lastCycleId: number | null = null

  for (const cycle of cycles) {
    const cycleIncidentEvents = cycle.events.filter((evt) => INCIDENT_TYPES.has(evt.type))
    const isIncidentCycle = cycleIncidentEvents.length > 0
    if (!isIncidentCycle) continue

    const cycleAgents = cycleIncidentEvents
      .map((evt) => evt.agentId)
      .filter((id): id is string => Boolean(id))

    const cycleTypes = Array.from(new Set(cycleIncidentEvents.map((evt) => evt.type)))
    const cycleMutation = cycleTypes.includes("mutation")

    if (
      !openSpan ||
      lastCycleId === null ||
      cycle.cycleId > lastCycleId + 1
    ) {
      openSpan = {
        incidentStartCycle: cycle.cycleId,
        incidentEndCycle: cycle.cycleId,
        affectedAgents: Array.from(new Set(cycleAgents)),
        mutationOccurred: cycleMutation,
        eventTypes: cycleTypes,
      }
      spans.push(openSpan)
    } else {
      openSpan.incidentEndCycle = cycle.cycleId
      openSpan.affectedAgents = Array.from(new Set([...openSpan.affectedAgents, ...cycleAgents]))
      openSpan.mutationOccurred = openSpan.mutationOccurred || cycleMutation
      openSpan.eventTypes = Array.from(new Set([...openSpan.eventTypes, ...cycleTypes]))
    }

    lastCycleId = cycle.cycleId
  }

  return spans
}

function toneForSpan(span: IncidentSpan): string {
  if (span.eventTypes.includes("routing_freeze")) return "bg-red-600/80"
  if (span.eventTypes.includes("suppression")) return "bg-amber-600/80"
  if (span.eventTypes.includes("threshold_breach")) return "bg-orange-600/80"
  return "bg-blue-600/80"
}

export function IncidentTimeline({ events, history }: IncidentTimelineProps) {
  const cycleBuckets = useMemo(() => groupEventsByCycle(events, history), [events, history])
  const incidentSpans = useMemo(() => buildIncidentSpans(cycleBuckets), [cycleBuckets])

  const allCycles = cycleBuckets.map((c) => c.cycleId)
  const firstCycle = allCycles.length > 0 ? Math.min(...allCycles) : 0
  const lastCycle = allCycles.length > 0 ? Math.max(...allCycles) : 0
  const totalCycles = Math.max(1, lastCycle - firstCycle + 1)

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-1">Incident Timeline</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Incident spans grouped by cycle, not raw timestamps.
      </p>
      <Separator className="mb-4" />

      {incidentSpans.length === 0 ? (
        <p className="text-sm text-muted-foreground">No incidents detected in current stream.</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {incidentSpans.map((span, idx) => {
              const startOffset = span.incidentStartCycle - firstCycle
              const endOffset = span.incidentEndCycle - firstCycle
              return (
                <div key={`${span.incidentStartCycle}-${span.incidentEndCycle}-${idx}`} className="space-y-1">
                  <div className="relative h-6 rounded border bg-muted/30">
                    <div
                      className={`absolute top-0 h-full rounded ${toneForSpan(span)}`}
                      style={{
                        left: `${(startOffset / totalCycles) * 100}%`,
                        width: `${((endOffset - startOffset + 1) / totalCycles) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">
                      cycles {span.incidentStartCycle}
                      {span.incidentEndCycle > span.incidentStartCycle
                        ? `-${span.incidentEndCycle}`
                        : ""}
                    </Badge>
                    <span className="text-muted-foreground">
                      agents: {span.affectedAgents.length > 0 ? span.affectedAgents.join(", ") : "none"}
                    </span>
                    {span.mutationOccurred && <Badge className="text-[10px]">mutation</Badge>}
                    {span.eventTypes.map((type) => (
                      <Badge key={`${span.incidentStartCycle}-${type}`} variant="secondary" className="text-[10px]">
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}
