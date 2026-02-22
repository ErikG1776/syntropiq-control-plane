"use client"

import { AgentRegistryPanel } from "@/components/control-plane/AgentRegistryPanel"
import { Card } from "@/components/ui/card"
import { useGovernanceStore } from "@/store/governance-store"

export default function AgentsPage() {
  const connected = useGovernanceStore((s) => s.connected)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Agents
        </h1>
        <p className="text-sm text-muted-foreground">
          Registered agents in the current governance stream.
        </p>
      </div>

      {!connected ? (
        <Card className="p-5 text-sm text-muted-foreground">
          Connect a source to view the agent registry.
        </Card>
      ) : (
        <AgentRegistryPanel />
      )}
    </div>
  )
}
