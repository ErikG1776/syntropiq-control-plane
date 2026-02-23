"use client"

import { AgentTopologyGraph } from "@/components/control-plane/AgentTopologyGraph"
import { TrustHeatmap } from "@/components/control-plane/TrustHeatmap"
import { DataGuard } from "@/components/control-plane/DataGuard"

export default function TopologyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Topology</h1>
        <p className="text-sm text-muted-foreground">
          Agent relationships, trust heatmap, and governance topology.
        </p>
      </div>

      <DataGuard emptyMessage="Connect a source to view the agent topology.">
        <div className="space-y-6">
          <AgentTopologyGraph />
          <TrustHeatmap />
        </div>
      </DataGuard>
    </div>
  )
}
