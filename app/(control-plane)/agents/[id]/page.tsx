"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useGovernanceStore } from "@/store/governance-store"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts"

const severityClass: Record<string, string> = {
  info: "text-muted-foreground",
  warn: "text-amber-600",
  error: "text-red-600",
  critical: "text-red-700 font-semibold",
}

export default function AgentDetailPage() {
  const params = useParams()
  const agentId = params.id as string

  const snapshot = useGovernanceStore((s) => s.snapshot)
  const history = useGovernanceStore((s) => s.history)
  const events = useGovernanceStore((s) => s.events)

  const agent = snapshot?.agents.find((a) => a.id === agentId)
  const thresholds = snapshot?.thresholds

  const chartData = history.map((snap, idx) => {
    const a = snap.agents.find((ag) => ag.id === agentId)
    return {
      idx,
      ts: snap.timestamp,
      trust: a?.trustScore ?? null,
      authority: a?.authorityWeight ?? null,
    }
  })

  const agentEvents = events
    .filter((e) => e.agentId === agentId)
    .slice(-100)
    .reverse()

  const statusTimeline: { ts: string; status: string }[] = []
  let lastStatus = ""
  for (const snap of history) {
    const a = snap.agents.find((ag) => ag.id === agentId)
    if (a && a.status !== lastStatus) {
      statusTimeline.push({ ts: snap.timestamp, status: a.status })
      lastStatus = a.status
    }
  }

  if (!agent) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/agents"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Agents
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">Agent Not Found</h1>
        <p className="text-sm text-muted-foreground">
          Agent &quot;{agentId}&quot; is not in the current snapshot. Connect a source or check the agent ID.
        </p>
      </div>
    )
  }

  const statusVariant =
    agent.status === "suppressed"
      ? "destructive"
      : agent.status === "probation"
        ? "secondary"
        : "default"

  const trustThreshold = thresholds?.trustThreshold ?? -1
  const isBreach = trustThreshold >= 0 && agent.trustScore < trustThreshold

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/agents"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Agents
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{agent.id}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            <span>Trust: <span className="font-mono text-foreground">{agent.trustScore.toFixed(3)}</span></span>
            <span>Authority: <span className="font-mono text-foreground">{agent.authorityWeight.toFixed(3)}</span></span>
            {agent.capabilities && (
              <span>Capabilities: {agent.capabilities.join(", ")}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant}>{agent.status}</Badge>
          {isBreach && (
            <Badge variant="destructive" className="text-[10px]">BREACH</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4">Trust Over Time</h2>
          <div className="h-[240px]">
            {chartData.length < 2 ? (
              <p className="text-sm text-muted-foreground">Awaiting history data...</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="idx" tick={false} />
                  <YAxis domain={[0, 1]} />
                  <Tooltip
                    labelFormatter={(v) => `Tick ${v}`}
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      color: "hsl(var(--popover-foreground))",
                      borderRadius: "0.375rem",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="trust"
                    name="Trust"
                    stroke="hsl(var(--chart-1))"
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                  />
                  {trustThreshold >= 0 && (
                    <ReferenceLine
                      y={trustThreshold}
                      stroke="hsl(var(--chart-3, 38 92% 50%))"
                      strokeDasharray="4 4"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4">Authority Over Time</h2>
          <div className="h-[240px]">
            {chartData.length < 2 ? (
              <p className="text-sm text-muted-foreground">Awaiting history data...</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="idx" tick={false} />
                  <YAxis domain={[0, 1]} />
                  <Tooltip
                    labelFormatter={(v) => `Tick ${v}`}
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      color: "hsl(var(--popover-foreground))",
                      borderRadius: "0.375rem",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="authority"
                    name="Authority"
                    stroke="hsl(var(--chart-4))"
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {statusTimeline.length > 0 && (
        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4">Status Timeline</h2>
          <div className="flex flex-wrap gap-2">
            {statusTimeline.map((entry, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs"
              >
                <Badge
                  variant={
                    entry.status === "suppressed"
                      ? "destructive"
                      : entry.status === "probation"
                        ? "secondary"
                        : "default"
                  }
                  className="text-[10px] px-1.5 py-0"
                >
                  {entry.status}
                </Badge>
                <span className="text-muted-foreground">
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="text-base font-semibold mb-4">
          Agent Events
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            ({agentEvents.length})
          </span>
        </h2>
        <Separator className="mb-4" />
        {agentEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events for this agent.</p>
        ) : (
          <ScrollArea className="h-[320px]">
            <div className="space-y-2 text-sm">
              {agentEvents.map((e) => (
                <div key={e.id} className="rounded-md border px-3 py-2">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className={severityClass[e.severity] ?? severityClass.info}>
                      {e.severity.toUpperCase()} &middot; {e.type}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-1">{e.message}</div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>

      {agent.labels && Object.keys(agent.labels).length > 0 && (
        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4">Labels</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(agent.labels).map(([k, v]) => (
              <Badge key={k} variant="outline">
                {k}: {v}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
