"use client"

import { useParams } from "next/navigation"
import { useGovernanceStore } from "@/store/governance-store"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

export default function AgentDetailPage() {
  const params = useParams()
  const agentId = params.id as string

  const snapshot = useGovernanceStore((s) => s.snapshot)
  const history = useGovernanceStore((s) => s.history)
  const events = useGovernanceStore((s) => s.events)

  const agent = snapshot?.agents.find((a) => a.id === agentId)

  const trustHistory = history.map((snap) => {
    const a = snap.agents.find((ag) => ag.id === agentId)
    return {
      ts: snap.timestamp,
      trust: a?.trustScore ?? 0,
    }
  })

  const agentEvents = events.filter((e) => e.agentId === agentId)

  if (!agent) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Agent Not Found</h1>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {agent.id}
        </h1>
        <p className="text-sm text-muted-foreground">
          Trust {agent.trustScore.toFixed(3)} · Authority {agent.authorityWeight.toFixed(3)}
        </p>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold mb-4">
          Trust Over Time
        </h2>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trustHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" tick={false} />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="trust"
                stroke="#2563eb"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold mb-4">
          Agent Events
        </h2>
        <Separator className="mb-4" />
        {agentEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No events for this agent.
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            {agentEvents.map((e) => (
              <div key={e.id} className="rounded border px-3 py-2">
                <div className="text-xs text-muted-foreground">
                  {e.timestamp}
                </div>
                <div>{e.message}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
