"use client"

import { AgentRegistryPanel } from "@/components/control-plane/AgentRegistryPanel"
import { DataGuard } from "@/components/control-plane/DataGuard"

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Registered agents in the current governance stream.
        </p>
      </div>

      <DataGuard emptyMessage="Connect a source to view the agent registry.">
        <AgentRegistryPanel />
      </DataGuard>
    </div>
  )
}
