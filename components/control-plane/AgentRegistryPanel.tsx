"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useGovernanceStore } from "@/store/governance-store"
import { getTrustTrend } from "@/store/governance-store"

function TrendIndicator({ agentId }: { agentId: string }) {
  const trend = getTrustTrend(agentId)

  if (trend === "unknown") return null

  const color =
    trend === "up"
      ? "text-emerald-600"
      : trend === "down"
        ? "text-red-600"
        : "text-muted-foreground"

  const symbol =
    trend === "up"
      ? "▲"
      : trend === "down"
        ? "▼"
        : "•"

  return (
    <span className={`text-xs font-medium ${color}`}>
      {symbol}
    </span>
  )
}

export function AgentRegistryPanel() {
  const snapshot = useGovernanceStore((s) => s.snapshot)
  const agents = snapshot?.agents ?? []

  const sorted = [...agents].sort((a, b) => {
    const aSupp = a.status === "suppressed" ? 0 : 1
    const bSupp = b.status === "suppressed" ? 0 : 1
    if (aSupp !== bSupp) return aSupp - bSupp
    return a.trustScore - b.trustScore
  })

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Agent Registry</h2>
        <span className="text-xs text-muted-foreground">
          {agents.length} total
        </span>
      </div>

      <Separator className="my-4" />

      {agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No agent data yet.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((agent) => (
            <Link
              key={agent.id}
              href={`/agents/${agent.id}`}
              className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted transition"
            >
              <div className="flex items-center gap-2">
                <div>
                  <div className="text-sm font-medium">
                    {agent.id}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Trust {agent.trustScore.toFixed(3)} | Authority {agent.authorityWeight.toFixed(3)}
                  </div>
                  {snapshot?.thresholds && (
                    <div className="text-[11px] mt-1 text-muted-foreground">
                      Threshold {snapshot.thresholds.trustThreshold.toFixed(2)}
                      {agent.trustScore < snapshot.thresholds.trustThreshold && (
                        <span className="ml-2 text-red-600 font-medium">
                          breach
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <TrendIndicator agentId={agent.id} />
              </div>

              <Badge
                variant={
                  agent.status === "suppressed"
                    ? "destructive"
                    : agent.status === "probation"
                      ? "secondary"
                      : "default"
                }
              >
                {agent.status}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}
