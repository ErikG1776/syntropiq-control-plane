"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useGovernanceStore } from "@/store/governance-store"
import type { AgentState, GovernanceSnapshot } from "@/lib/governance/schema"

function statusVariant(s: string) {
  return s === "suppressed"
    ? "destructive"
    : s === "probation"
      ? "secondary"
      : s === "active"
        ? "default"
        : "outline"
}

function TrustDelta({ prev, curr }: { prev: number; curr: number }) {
  const delta = curr - prev
  if (Math.abs(delta) < 0.001) {
    return <span className="text-muted-foreground">=</span>
  }
  return (
    <span className={delta > 0 ? "text-emerald-500" : "text-red-500"}>
      {delta > 0 ? "+" : ""}
      {delta.toFixed(3)}
    </span>
  )
}

function AgentDiff({
  prev,
  curr,
  thresholdTrust,
}: {
  prev: AgentState | undefined
  curr: AgentState
  thresholdTrust: number
}) {
  const statusChanged = prev && prev.status !== curr.status
  const isBreach = thresholdTrust >= 0 && curr.trustScore < thresholdTrust

  return (
    <div className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted/50">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-xs truncate max-w-[140px]">
          {curr.id}
        </span>
        {statusChanged && (
          <div className="flex items-center gap-1 text-xs">
            <Badge variant={statusVariant(prev!.status)} className="text-[9px] px-1 py-0">
              {prev!.status}
            </Badge>
            <span className="text-muted-foreground">&rarr;</span>
            <Badge variant={statusVariant(curr.status)} className="text-[9px] px-1 py-0">
              {curr.status}
            </Badge>
          </div>
        )}
        {!statusChanged && (
          <Badge variant={statusVariant(curr.status)} className="text-[9px] px-1 py-0">
            {curr.status}
          </Badge>
        )}
        {isBreach && (
          <Badge variant="destructive" className="text-[9px] px-1 py-0">
            BREACH
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs font-mono">
        <span className="text-muted-foreground">
          {prev ? prev.trustScore.toFixed(3) : "—"}
        </span>
        <span className="text-muted-foreground">&rarr;</span>
        <span>{curr.trustScore.toFixed(3)}</span>
        {prev && <TrustDelta prev={prev.trustScore} curr={curr.trustScore} />}
      </div>
    </div>
  )
}

function CycleDetail({
  prev,
  curr,
}: {
  prev: GovernanceSnapshot | null
  curr: GovernanceSnapshot
}) {
  const trustThreshold = curr.thresholds.trustThreshold

  // Agents that changed status
  const statusChanges = curr.agents.filter((a) => {
    const prevAgent = prev?.agents.find((p) => p.id === a.id)
    return prevAgent && prevAgent.status !== a.status
  })

  // Agents with significant trust changes
  const trustChanges = curr.agents
    .map((a) => {
      const prevAgent = prev?.agents.find((p) => p.id === a.id)
      const delta = prevAgent ? a.trustScore - prevAgent.trustScore : 0
      return { agent: a, prevAgent, delta }
    })
    .filter(({ delta }) => Math.abs(delta) > 0.001)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  // New agents
  const newAgents = prev
    ? curr.agents.filter(
        (a) => !prev.agents.find((p) => p.id === a.id),
      )
    : curr.agents

  // Removed agents
  const removedAgents = prev
    ? prev.agents.filter(
        (p) => !curr.agents.find((a) => a.id === p.id),
      )
    : []

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>Agents: {curr.agents.length}</span>
        <span>Active: {curr.agents.filter((a) => a.status === "active").length}</span>
        <span>Suppressed: {curr.suppressedCount}</span>
        <span>Events: {curr.eventCount}</span>
        <span>Healthy: {curr.healthy !== false ? "Yes" : "No"}</span>
      </div>

      {/* Status changes */}
      {statusChanges.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
            Status Changes ({statusChanges.length})
          </h4>
          {statusChanges.map((a) => (
            <AgentDiff
              key={a.id}
              prev={prev?.agents.find((p) => p.id === a.id)}
              curr={a}
              thresholdTrust={trustThreshold}
            />
          ))}
        </div>
      )}

      {/* Trust changes */}
      {trustChanges.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
            Trust Changes ({trustChanges.length})
          </h4>
          {trustChanges.map(({ agent, prevAgent }) => (
            <AgentDiff
              key={agent.id}
              prev={prevAgent}
              curr={agent}
              thresholdTrust={trustThreshold}
            />
          ))}
        </div>
      )}

      {/* New agents */}
      {newAgents.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
            New Agents ({newAgents.length})
          </h4>
          {newAgents.map((a) => (
            <AgentDiff
              key={a.id}
              prev={undefined}
              curr={a}
              thresholdTrust={trustThreshold}
            />
          ))}
        </div>
      )}

      {/* Removed agents */}
      {removedAgents.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-destructive uppercase mb-2">
            Removed Agents ({removedAgents.length})
          </h4>
          {removedAgents.map((a) => (
            <div key={a.id} className="text-sm text-muted-foreground px-2 py-1">
              <span className="font-mono text-xs">{a.id}</span>
              <span className="ml-2">
                (was {a.status}, trust {a.trustScore.toFixed(3)})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Thresholds */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
          Thresholds Applied
        </h4>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded border p-2">
            <div className="text-muted-foreground">Trust</div>
            <div className="font-mono font-semibold">
              {curr.thresholds.trustThreshold >= 0
                ? curr.thresholds.trustThreshold.toFixed(3)
                : "—"}
            </div>
          </div>
          <div className="rounded border p-2">
            <div className="text-muted-foreground">Suppression</div>
            <div className="font-mono font-semibold">
              {curr.thresholds.suppressionThreshold >= 0
                ? curr.thresholds.suppressionThreshold.toFixed(3)
                : "—"}
            </div>
          </div>
          <div className="rounded border p-2">
            <div className="text-muted-foreground">Drift Delta</div>
            <div className="font-mono font-semibold">
              {curr.thresholds.driftDelta >= 0
                ? curr.thresholds.driftDelta.toFixed(3)
                : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CycleInspector() {
  const history = useGovernanceStore((s) => s.history)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  const displayHistory = useMemo(
    () => history.slice(-50).reverse(),
    [history],
  )

  const selected = selectedIdx !== null ? displayHistory[selectedIdx] : null
  const previous =
    selectedIdx !== null && selectedIdx < displayHistory.length - 1
      ? displayHistory[selectedIdx + 1]
      : null

  if (history.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">
          No governance cycles recorded yet. Connect a datasource to begin observing cycles.
        </p>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Cycle list */}
      <Card className="p-5 lg:col-span-1">
        <h2 className="text-base font-semibold mb-3">Cycles</h2>
        <ScrollArea className="h-[500px]">
          <div className="space-y-1">
            {displayHistory.map((snap, i) => {
              const isSelected = selectedIdx === i
              const avgTrust =
                snap.agents.length > 0
                  ? snap.agents.reduce((s, a) => s + a.trustScore, 0) /
                    snap.agents.length
                  : 0

              return (
                <button
                  key={`${snap.timestamp}-${i}`}
                  onClick={() => setSelectedIdx(i)}
                  className={`w-full text-left rounded px-2 py-1.5 text-xs transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono">
                      #{snap.sequence ?? displayHistory.length - i}
                    </span>
                    <Badge
                      variant={
                        snap.healthy !== false ? "default" : "destructive"
                      }
                      className="text-[9px] px-1 py-0"
                    >
                      {snap.healthy !== false ? "ok" : "bad"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-0.5 text-[10px] opacity-75">
                    <span>
                      {new Date(snap.timestamp).toLocaleTimeString()}
                    </span>
                    <span>
                      {snap.agents.length}a / trust {avgTrust.toFixed(2)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </Card>

      {/* Cycle detail */}
      <Card className="p-5 lg:col-span-2">
        {selected ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">
                Cycle #{selected.sequence ?? "—"}
              </h2>
              <span className="text-xs text-muted-foreground">
                {new Date(selected.timestamp).toLocaleString()}
              </span>
            </div>
            <Separator className="mb-4" />
            <ScrollArea className="h-[450px]">
              <CycleDetail prev={previous} curr={selected} />
            </ScrollArea>
          </>
        ) : (
          <div className="flex items-center justify-center h-[500px] text-sm text-muted-foreground">
            Select a cycle from the list to inspect
          </div>
        )}
      </Card>
    </div>
  )
}
