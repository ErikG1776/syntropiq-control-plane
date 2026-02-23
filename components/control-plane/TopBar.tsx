"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { ConnectSourceDialog } from "@/components/control-plane/ConnectSourceDialog"
import { TimeRangePicker } from "@/components/control-plane/TimeRangePicker"
import { ThemeToggle } from "@/components/control-plane/ThemeToggle"
import { activeFilterCount, useFilters } from "@/store/filter-store"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import {
  getEventsPerMinute,
  getStreamLatencyMs,
  useGovernanceStore,
} from "@/store/governance-store"

function getHealthTone(latencyMs: number | null): "green" | "yellow" | "red" {
  if (latencyMs === null) return "red"
  if (latencyMs <= 5_000) return "green"
  if (latencyMs <= 15_000) return "yellow"
  return "red"
}

const SOURCE_LABELS: Record<string, string> = {
  live_api: "Live API",
  live_ws: "WebSocket",
  live_sse: "SSE",
  replay_infra_chain: "Replay: Infra",
  replay_readmission: "Replay: Readmission",
  replay_finance: "Replay: Finance",
  replay_governance_demo: "Replay: Demo",
}

export function TopBar() {
  const connected = useGovernanceStore((s) => s.connected)
  const source = useGovernanceStore((s) => s.source)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const filters = useFilters()
  const filterCount = activeFilterCount(filters)

  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1_000)
    return () => clearInterval(tick)
  }, [])

  const streamLatencyMs = useMemo(() => getStreamLatencyMs(nowMs), [nowMs])
  const eventsPerMinute = useMemo(() => getEventsPerMinute(nowMs), [nowMs])
  const healthTone = getHealthTone(streamLatencyMs)
  const healthClass =
    healthTone === "green"
      ? "bg-emerald-600 text-white"
      : healthTone === "yellow"
        ? "bg-amber-500 text-black"
        : "bg-red-600 text-white"

  const sourceLabel = source ? (SOURCE_LABELS[source] ?? source) : "no source"

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
            Syntropiq Control Plane
          </h1>
          <p className="text-sm text-muted-foreground">
            Governance and infrastructure monitoring
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={connected ? "default" : "secondary"}>
            {connected ? "connected" : "disconnected"}
          </Badge>
          <Badge variant="outline">{sourceLabel}</Badge>
          <Badge className={healthClass}>
            heartbeat{" "}
            {streamLatencyMs === null ? "n/a" : `${Math.floor(streamLatencyMs / 1000)}s`}
          </Badge>
          <Badge variant="outline">epm {eventsPerMinute}</Badge>
          <ConnectSourceDialog />
          <ThemeToggle />
        </div>
      </div>

      {/* Global time range + active filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <TimeRangePicker />
        {filters.agentId && (
          <Badge variant="secondary" className="gap-1">
            agent: {filters.agentId}
            <button onClick={() => filters.setAgentId("")} className="ml-0.5 hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {filters.severity && (
          <Badge variant="secondary" className="gap-1">
            severity: {filters.severity}
            <button onClick={() => filters.setSeverity("")} className="ml-0.5 hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {filters.eventType && (
          <Badge variant="secondary" className="gap-1">
            type: {filters.eventType}
            <button onClick={() => filters.setEventType("")} className="ml-0.5 hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {filters.status && (
          <Badge variant="secondary" className="gap-1">
            status: {filters.status}
            <button onClick={() => filters.setStatus("")} className="ml-0.5 hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {filterCount > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={filters.clearAll}
          >
            Clear all
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground hidden sm:inline">
          <kbd className="px-1 py-0.5 rounded border text-[10px]">⌘K</kbd> command palette
        </span>
      </div>
    </div>
  )
}
