"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useGovernanceStore, getConnectionHealth } from "@/store/governance-store"

export function ConnectionHealthPanel() {
  const connected = useGovernanceStore((s) => s.connected)
  const source = useGovernanceStore((s) => s.source)
  const [health, setHealth] = useState(() => getConnectionHealth())

  useEffect(() => {
    if (!connected) return
    const tick = setInterval(() => setHealth(getConnectionHealth()), 1000)
    return () => clearInterval(tick)
  }, [connected])

  if (!connected) return null

  const latencyTone =
    health.latencyMs === null
      ? "red"
      : health.latencyMs <= 5_000
        ? "green"
        : health.latencyMs <= 15_000
          ? "yellow"
          : "red"

  const latencyClass =
    latencyTone === "green"
      ? "text-emerald-500"
      : latencyTone === "yellow"
        ? "text-amber-500"
        : "text-red-500"

  const uptimeStr =
    health.uptimeMs > 0
      ? health.uptimeMs >= 60_000
        ? `${Math.floor(health.uptimeMs / 60_000)}m ${Math.floor((health.uptimeMs % 60_000) / 1000)}s`
        : `${Math.floor(health.uptimeMs / 1000)}s`
      : "—"

  const metrics = [
    {
      label: "Uptime",
      value: uptimeStr,
    },
    {
      label: "Latency",
      value: health.latencyMs !== null ? `${(health.latencyMs / 1000).toFixed(1)}s` : "—",
      className: latencyClass,
    },
    {
      label: "Messages",
      value: health.messagesReceived,
    },
    {
      label: "Dropped",
      value: health.messagesDropped,
      className: health.messagesDropped > 0 ? "text-amber-500" : undefined,
    },
    {
      label: "Warnings",
      value: health.validationWarnings,
      className: health.validationWarnings > 0 ? "text-amber-500" : undefined,
    },
  ]

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Connection Health</h3>
        <Badge variant="default" className="text-[10px]">
          {source}
        </Badge>
      </div>
      <div className="grid grid-cols-5 gap-3">
        {metrics.map((m) => (
          <div key={m.label}>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {m.label}
            </div>
            <div className={`text-lg font-semibold font-mono ${m.className ?? ""}`}>
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
