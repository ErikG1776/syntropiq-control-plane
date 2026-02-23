"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useGovernanceStore } from "@/store/governance-store"
import type { BackendGovernanceCycleV1 } from "@/lib/adapters/telemetry"

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function AuthorityRedistributionBar({ cycle }: { cycle: BackendGovernanceCycleV1 }) {
  const entries = Object.entries(cycle.authority_redistribution)
    .map(([agentId, delta]) => ({ agentId, delta, weight: Math.abs(delta) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)

  if (entries.length === 0) {
    return <div className="text-xs text-muted-foreground">No authority movement</div>
  }

  const total = entries.reduce((sum, entry) => sum + entry.weight, 0) || 1
  const colors = ["bg-sky-500/70", "bg-amber-500/70", "bg-fuchsia-500/70"]

  return (
    <div className="space-y-1">
      <div className="h-2 w-full overflow-hidden rounded bg-muted">
        <div className="flex h-full w-full">
          {entries.map((entry, idx) => (
            <div
              key={entry.agentId}
              className={`${colors[idx]} authority-segment`}
              style={{ width: `${(entry.weight / total) * 100}%` }}
              title={`${entry.agentId}: ${entry.delta >= 0 ? "+" : ""}${entry.delta.toFixed(3)}`}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {entries.map((entry, idx) => (
          <span key={entry.agentId} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded ${colors[idx]}`} />
            {entry.agentId}: {entry.delta >= 0 ? "+" : ""}
            {entry.delta.toFixed(3)}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function ExecutionsPage() {
  const connected = useGovernanceStore((s) => s.connected)
  const [cycles, setCycles] = useState<BackendGovernanceCycleV1[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!connected) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/control-plane/cycles?limit=50", { cache: "no-store" })
        if (!res.ok) throw new Error(`Cycle adapter unavailable (${res.status})`)
        const json = await res.json()
        if (cancelled) return
        setCycles(Array.isArray(json) ? json : [])
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load cycles")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const interval = setInterval(load, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [connected])

  const summary = useMemo(() => {
    const total = cycles.length
    const successes = cycles.reduce((sum, cycle) => sum + cycle.successes, 0)
    const failures = cycles.reduce((sum, cycle) => sum + cycle.failures, 0)
    const trustDelta = cycles.reduce((sum, cycle) => sum + cycle.trust_delta_total, 0)
    return { total, successes, failures, trustDelta }
  }, [cycles])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Executions</h1>
        <p className="text-sm text-muted-foreground">
          Governance cycle summaries from the control-plane adapter.
        </p>
      </div>

      {!connected ? (
        <Card className="p-5 text-sm text-muted-foreground">
          Connect a source to view execution history.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Cycles</div>
              <div className="mt-2 text-2xl font-semibold">{summary.total}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Successes</div>
              <div className="mt-2 text-2xl font-semibold">{summary.successes}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Failures</div>
              <div className="mt-2 text-2xl font-semibold">{summary.failures}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Trust Delta</div>
              <div className="mt-2 text-2xl font-semibold">{summary.trustDelta.toFixed(3)}</div>
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="text-base font-semibold mb-1">Recent Governance Cycles</h2>
            <p className="text-xs text-muted-foreground mb-4">
              run_id, agent outcomes, redistribution, and cycle event lists
            </p>
            <Separator className="mb-4" />

            {loading && cycles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading cycles...</p>
            ) : error ? (
              <p className="text-sm text-red-500">{error}</p>
            ) : cycles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cycles available yet.</p>
            ) : (
              <div className="space-y-3">
                {cycles
                  .slice()
                  .reverse()
                  .map((cycle) => {
                    const total = Math.max(1, cycle.successes + cycle.failures)
                    const successRate = cycle.successes / total
                    return (
                      <div key={cycle.cycle_id} className="rounded border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{cycle.run_id}</Badge>
                            <Badge variant="secondary">{cycle.cycle_id}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(cycle.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {cycle.total_agents} agents | success {formatPct(successRate)}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>successes: {cycle.successes}</span>
                          <span>failures: {cycle.failures}</span>
                          <span>trust delta: {cycle.trust_delta_total.toFixed(3)}</span>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          authority redistribution:{" "}
                          {Object.keys(cycle.authority_redistribution).length > 0
                            ? Object.entries(cycle.authority_redistribution)
                                .map(([agentId, delta]) => `${agentId}:${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`)
                                .join(", ")
                            : "none"}
                        </div>
                        <div className="mt-2">
                          <AuthorityRedistributionBar cycle={cycle} />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          events: {cycle.events.map((event) => event.type).join(", ") || "none"}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
