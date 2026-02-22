"use client"

import { Card } from "@/components/ui/card"
import { useGovernanceStore } from "@/store/governance-store"

export function KpiRow() {
  const snapshot = useGovernanceStore((s) => s.snapshot)
  const events = useGovernanceStore((s) => s.events)
  const connected = useGovernanceStore((s) => s.connected)

  const mutationCount = events.filter((e) => e.type === "mutation").length
  const stabilityScore =
    snapshot && snapshot.agents.length > 0
      ? snapshot.agents.reduce((acc, a) => acc + a.trustScore * a.authorityWeight, 0)
      : 0

  const stabilityTone =
    stabilityScore >= 0.75
      ? "green"
      : stabilityScore >= 0.55
      ? "amber"
      : "red"

  const stabilityClass =
    stabilityTone === "green"
      ? "text-emerald-600"
      : stabilityTone === "amber"
      ? "text-amber-600"
      : "text-red-600"

  const metrics = [
    {
      label: "Stability",
      value: snapshot
        ? stabilityScore.toFixed(3)
        : "—",
    },
    { label: "Agents", value: snapshot?.agents.length ?? 0 },
    { label: "Suppressed", value: snapshot?.suppressedCount ?? 0 },
    { label: "Mutations", value: mutationCount },
    { label: "Events", value: events.length },
    { label: "Connection", value: connected ? "connected" : "disconnected" },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
      {metrics.map((metric) => (
        <Card key={metric.label} className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {metric.label}
          </div>
          <div className={`mt-2 text-2xl font-semibold ${
            metric.label === "Stability" ? stabilityClass : ""
          }`}>
            {metric.value}
          </div>
        </Card>
      ))}
    </div>
  )
}
