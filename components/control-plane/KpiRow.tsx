"use client"

import { Card } from "@/components/ui/card"
import { useGovernanceStore } from "@/store/governance-store"

export function KpiRow() {
  const snapshot = useGovernanceStore((s) => s.snapshot)
  const events = useGovernanceStore((s) => s.events)
  const connected = useGovernanceStore((s) => s.connected)

  const mutationCount = events.filter((e) => e.type === "mutation").length

  // Stability: trust-weighted authority proxy
  const stabilityScore =
    snapshot && snapshot.agents.length > 0
      ? snapshot.agents.reduce((acc, a) => acc + a.trustScore * a.authorityWeight, 0) /
        snapshot.agents.length
      : null

  const stabilityTone =
    stabilityScore === null
      ? "muted"
      : stabilityScore >= 0.75
        ? "green"
        : stabilityScore >= 0.55
          ? "amber"
          : "red"

  const stabilityClass =
    stabilityTone === "green"
      ? "text-emerald-500"
      : stabilityTone === "amber"
        ? "text-amber-500"
        : stabilityTone === "red"
          ? "text-red-500"
          : "text-muted-foreground"

  const metrics = [
    {
      label: "Stability",
      value: stabilityScore !== null ? stabilityScore.toFixed(3) : "\u2014",
      sublabel: "proxy",
    },
    { label: "Agents", value: snapshot?.agents.length ?? 0 },
    { label: "Suppressed", value: snapshot?.suppressedCount ?? 0 },
    { label: "Mutations", value: mutationCount },
    { label: "Events", value: events.length },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {metrics.map((metric) => (
        <Card key={metric.label} className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {metric.label}
            {"sublabel" in metric && metric.sublabel && (
              <span className="ml-1 text-[9px] normal-case opacity-60">({metric.sublabel})</span>
            )}
          </div>
          <div
            className={`mt-2 text-2xl font-semibold ${
              metric.label === "Stability" ? stabilityClass : ""
            }`}
          >
            {metric.value}
          </div>
        </Card>
      ))}
    </div>
  )
}
