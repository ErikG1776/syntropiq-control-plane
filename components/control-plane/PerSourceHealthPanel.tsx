"use client"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { useGovernanceStore } from "@/store/governance-store"
import {
  parseCustomSourceKey,
  useCustomDataSourceStore,
} from "@/store/custom-datasource-store"

const SOURCE_LABELS: Record<string, string> = {
  live_api: "Live API",
  live_grpc: "gRPC-web",
  live_ws: "WebSocket",
  live_sse: "SSE",
  replay_infra_chain: "Replay: Infra",
  replay_readmission: "Replay: Readmission",
  replay_finance: "Replay: Finance",
  replay_governance_demo: "Replay: Demo",
}

function sourceLabelFor(key: string, customDataSources: ReturnType<typeof useCustomDataSourceStore.getState>["customDataSources"]): string {
  const customId = parseCustomSourceKey(key)
  if (customId) {
    const custom = customDataSources.find((ds) => ds.id === customId)
    return custom ? `Custom: ${custom.label}` : key
  }
  return SOURCE_LABELS[key] ?? key
}

export function PerSourceHealthPanel() {
  const activeSources = useGovernanceStore((s) => s.activeSources)
  const stabilityBySource = useGovernanceStore((s) => s.stabilityBySource)
  const connections = useGovernanceStore((s) => s.connections)
  const customDataSources = useCustomDataSourceStore((s) => s.customDataSources)

  const sources = activeSources.length > 0 ? activeSources : Object.keys(connections)

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-3">Per-Source Health</h2>
      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active sources.</p>
      ) : (
        <div className="space-y-2">
          {sources.map((key) => {
            const conn = connections[key]
            const stability = stabilityBySource[key]
            const status = conn?.error
              ? "error"
              : conn?.connecting
                ? "connecting"
                : conn?.connected
                  ? "connected"
                  : "disconnected"

            return (
              <div
                key={key}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded border px-3 py-2 text-sm"
              >
                <div className="truncate">{sourceLabelFor(key, customDataSources)}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {typeof stability === "number" ? `${(stability * 100).toFixed(1)}%` : "--"}
                </div>
                <Badge
                  variant={
                    status === "connected"
                      ? "default"
                      : status === "connecting"
                        ? "secondary"
                        : status === "error"
                          ? "destructive"
                          : "outline"
                  }
                  className="capitalize"
                >
                  {status}
                </Badge>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
