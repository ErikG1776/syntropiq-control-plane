"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { ConnectSourceDialog } from "@/components/control-plane/ConnectSourceDialog"
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
  live_events_stream: "Events SSE",
  replay_infra_chain: "Replay: Infra",
  replay_readmission: "Replay: Readmission",
  replay_finance: "Replay: Finance",
}

export function TopBar() {
  const connected = useGovernanceStore((s) => s.connected)
  const source = useGovernanceStore((s) => s.source)
  const [nowMs, setNowMs] = useState(() => Date.now())

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
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Syntropiq Control Plane</h1>
        <p className="text-sm text-muted-foreground">Governance and infrastructure monitoring</p>
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
      </div>
    </div>
  )
}
