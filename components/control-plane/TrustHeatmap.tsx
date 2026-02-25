"use client"

import { useMemo } from "react"
import { Card } from "@/components/ui/card"
import { useGovernanceStore } from "@/store/governance-store"
import { useFilters } from "@/store/filter-store"

/**
 * Trust Heatmap: agents (rows) x time buckets (columns).
 * Cell color = trust score (green -> red gradient).
 */

function trustToColor(trust: number): string {
  // Green (high trust) -> Yellow (mid) -> Red (low trust)
  const clamped = Math.max(0, Math.min(1, trust))
  if (clamped >= 0.7) {
    // Green range
    const t = (clamped - 0.7) / 0.3
    return `hsl(${120 + t * 20}, 70%, ${35 + t * 10}%)`
  }
  if (clamped >= 0.4) {
    // Yellow range
    const t = (clamped - 0.4) / 0.3
    return `hsl(${40 + t * 80}, 75%, 45%)`
  }
  // Red range
  const t = clamped / 0.4
  return `hsl(${t * 40}, 80%, ${30 + t * 15}%)`
}

function trustToTextColor(trust: number): string {
  return trust > 0.6 ? "#fff" : trust > 0.3 ? "#000" : "#fff"
}

const MAX_COLUMNS = 40

export function TrustHeatmap() {
  const history = useGovernanceStore((s) => s.history)
  const filters = useFilters()

  const { agentIds, columns } = useMemo(() => {
    if (history.length === 0) return { agentIds: [], columns: [] }

    // Collect all unique agent IDs
    const idSet = new Set<string>()
    for (const snap of history) {
      for (const agent of snap.agents) {
        idSet.add(agent.id)
      }
    }
    let agentIds = [...idSet].sort()

    // Apply agent filter
    if (filters.agentId) {
      agentIds = agentIds.filter((id) => id === filters.agentId)
    }
    // Apply status filter
    if (filters.status) {
      const latestSnap = history[history.length - 1]
      const matchingIds = new Set(
        latestSnap.agents
          .filter((a) => a.status === filters.status)
          .map((a) => a.id),
      )
      agentIds = agentIds.filter((id) => matchingIds.has(id))
    }

    // Take last N snapshots (downsample if needed)
    let snaps = history
    if (filters.timeRange > 0) {
      const cutoff = Date.now() - filters.timeRange // eslint-disable-line react-hooks/purity -- time cutoff
      snaps = snaps.filter((s) => Date.parse(s.timestamp) >= cutoff)
    }

    const step = Math.max(1, Math.floor(snaps.length / MAX_COLUMNS))
    const sampled = snaps.filter((_, i) => i % step === 0).slice(-MAX_COLUMNS)

    const columns = sampled.map((snap) => ({
      ts: snap.timestamp,
      agents: new Map(snap.agents.map((a) => [a.id, a.trustScore])),
    }))

    return { agentIds, columns }
  }, [history, filters.agentId, filters.status, filters.timeRange])

  if (history.length === 0 || agentIds.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-base font-semibold mb-2">Trust Heatmap</h2>
        <p className="text-sm text-muted-foreground">
          Waiting for history data to build the heatmap...
        </p>
      </Card>
    )
  }

  const cellW = Math.max(16, Math.floor(700 / columns.length))
  const cellH = 28

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold">Trust Heatmap</h2>
          <p className="text-xs text-muted-foreground">
            Agents (rows) x time (columns). Color = trust score.
          </p>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <div
            className="w-10 h-3 rounded-sm"
            style={{
              background: "linear-gradient(to right, hsl(0,80%,35%), hsl(40,75%,45%), hsl(140,70%,45%))",
            }}
          />
          <span>0</span>
          <span className="ml-3">1</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block">
          {/* Header row with time labels */}
          <div className="flex" style={{ marginLeft: "120px" }}>
            {columns.map((col, i) => (
              <div
                key={i}
                className="text-[8px] text-muted-foreground text-center"
                style={{ width: cellW }}
              >
                {i === 0 || i === columns.length - 1
                  ? new Date(col.ts).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : ""}
              </div>
            ))}
          </div>

          {/* Agent rows */}
          {agentIds.map((agentId) => (
            <div key={agentId} className="flex items-center">
              <div
                className="text-xs font-mono truncate pr-2 text-right"
                style={{ width: "120px" }}
                title={agentId}
              >
                {agentId}
              </div>
              {columns.map((col, ci) => {
                const trust = col.agents.get(agentId)
                const hasTrust = trust !== undefined
                return (
                  <div
                    key={ci}
                    className="border border-background/50"
                    style={{
                      width: cellW,
                      height: cellH,
                      background: hasTrust
                        ? trustToColor(trust)
                        : "hsl(var(--muted))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    title={
                      hasTrust
                        ? `${agentId} @ ${new Date(col.ts).toLocaleTimeString()}: ${trust.toFixed(3)}`
                        : `${agentId}: no data`
                    }
                  >
                    {hasTrust && cellW >= 28 && (
                      <span
                        className="text-[8px] font-mono"
                        style={{ color: trustToTextColor(trust) }}
                      >
                        {trust.toFixed(2)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
