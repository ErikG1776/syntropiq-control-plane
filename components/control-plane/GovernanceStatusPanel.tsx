"use client"

import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { GovernanceEvent } from "@/lib/governance/schema"
import { useGovernanceStore } from "@/store/governance-store"

type AuthorityMap = Record<string, number>

function parseAuthorityDistribution(evt: GovernanceEvent | undefined): AuthorityMap {
  const raw = evt?.metadata?.authority_distribution
  if (!raw || typeof raw !== "object") return {}
  const out: AuthorityMap = {}
  for (const [agentId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) out[agentId] = value
  }
  return out
}

export function GovernanceStatusPanel() {
  const snapshot = useGovernanceStore((s) => s.snapshot)
  const events = useGovernanceStore((s) => s.events)

  const latestMediation = useMemo(
    () => [...events].reverse().find((e) => e.type === "mediation_decision"),
    [events],
  )
  const latestCircuit = useMemo(
    () => [...events].reverse().find((e) => e.type === "circuit_breaker"),
    [events],
  )

  const strategyName =
    (typeof latestMediation?.metadata?.strategy_name === "string"
      ? latestMediation.metadata.strategy_name
      : undefined) ??
    (typeof latestMediation?.metadata?.selection_strategy === "string"
      ? latestMediation.metadata.selection_strategy
      : "unknown")

  const selectedAgents = Array.isArray(latestMediation?.metadata?.selected_agents)
    ? (latestMediation!.metadata!.selected_agents as unknown[])
      .filter((v): v is string => typeof v === "string")
    : typeof latestMediation?.metadata?.selected_agent === "string"
      ? [latestMediation.metadata.selected_agent]
      : []

  const authorityDistribution = parseAuthorityDistribution(latestMediation)
  const authorityRows = Object.entries(authorityDistribution)
    .sort((a, b) => b[1] - a[1])

  const circuitReason =
    typeof latestCircuit?.metadata?.reason === "string"
      ? latestCircuit.metadata.reason
      : null

  const circuitState = !latestCircuit
    ? "closed"
    : circuitReason === "no_eligible_agents" || circuitReason === "cooldown_active"
      ? "open"
      : circuitReason === "cooldown_release_block"
        ? "cooldown"
        : "closed"

  const circuitClass =
    circuitState === "open"
      ? "bg-red-100 text-red-700 border-red-300"
      : circuitState === "cooldown"
        ? "bg-amber-100 text-amber-700 border-amber-300"
        : "bg-green-100 text-green-700 border-green-300"

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Governance Status</h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={circuitClass}>
            Circuit: {circuitState}
          </Badge>
          <Badge variant="outline">Strategy: {strategyName}</Badge>
          {snapshot && (
            <Badge variant="secondary" className="text-[10px]">
              {new Date(snapshot.timestamp).toLocaleTimeString()}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="text-sm font-medium">Selected Agents</div>
          {selectedAgents.length === 0 ? (
            <div className="text-xs text-muted-foreground">No mediation decision yet.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedAgents.map((agentId) => (
                <Badge key={agentId} variant="secondary">
                  {agentId}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Authority Distribution</div>
          {authorityRows.length === 0 ? (
            <div className="text-xs text-muted-foreground">No authority distribution available.</div>
          ) : (
            <div className="space-y-2">
              {authorityRows.map(([agentId, weight]) => (
                <div key={agentId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>{agentId}</span>
                    <span className="font-mono">{(weight * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded bg-muted overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${Math.max(0, Math.min(100, weight * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
