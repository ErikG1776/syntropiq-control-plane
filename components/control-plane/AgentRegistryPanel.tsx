"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useGovernanceStore, getTrustTrend } from "@/store/governance-store"

/* ---- Miniature trust sparkline (pure SVG, no deps) ---- */
function TrustSparkline({ agentId }: { agentId: string }) {
  const history = useGovernanceStore((s) => s.history)
  const points = history
    .slice(-20)
    .map((snap) => snap.agents.find((a) => a.id === agentId)?.trustScore ?? null)
    .filter((v): v is number => v !== null)

  if (points.length < 2) return <span className="text-xs text-muted-foreground">&mdash;</span>

  const w = 64
  const h = 20
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 0.01

  const pathData = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w
      const y = h - ((v - min) / range) * h
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")

  const color = points[points.length - 1] >= points[0] ? "#10b981" : "#ef4444"

  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <path d={pathData} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  )
}

/* ---- Trend arrow ---- */
function TrendArrow({ agentId }: { agentId: string }) {
  const trend = getTrustTrend(agentId)
  if (trend === "unknown") return null

  const cfg = {
    up: { symbol: "\u25B2", cls: "text-emerald-500" },
    down: { symbol: "\u25BC", cls: "text-red-500" },
    flat: { symbol: "\u2022", cls: "text-muted-foreground" },
  }[trend]

  return <span className={`text-xs font-semibold ${cfg.cls}`}>{cfg.symbol}</span>
}

/* ---- Status badge with semantic colors ---- */
function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "suppressed"
      ? "destructive"
      : status === "probation"
        ? "secondary"
        : status === "active"
          ? "outline"
          : "outline"

  if (status === "suppressed") {
    return (
      <Badge variant={variant} className="suppressed-badge-pulse">
        SUPPRESSED
      </Badge>
    )
  }
  if (status === "active") {
    return (
      <Badge
        variant={variant}
        className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
      >
        active
      </Badge>
    )
  }
  return <Badge variant={variant}>{status}</Badge>
}

/* ---- Threshold breach indicator ---- */
function BreachIndicator({
  trustScore,
  threshold,
}: {
  trustScore: number
  threshold: number
}) {
  if (threshold < 0) return null
  if (trustScore >= threshold) return null
  return (
    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
      BREACH
    </Badge>
  )
}

function formatScore(v: number): string {
  return v.toFixed(3)
}

function formatThreshold(v: number): string {
  return v < 0 ? "\u2014" : v.toFixed(2)
}

function formatDelta(v: number): string {
  if (Math.abs(v) < 0.0005) return "0.000"
  return `${v > 0 ? "+" : ""}${v.toFixed(3)}`
}

export function AgentRegistryPanel() {
  const snapshot = useGovernanceStore((s) => s.snapshot)
  const events = useGovernanceStore((s) => s.events)
  const agents = snapshot?.agents ?? []
  const trustThreshold = snapshot?.thresholds.trustThreshold ?? -1
  const [trustFlash, setTrustFlash] = useState<Record<string, "up" | "down">>({})
  const [statusFlash, setStatusFlash] = useState<Record<string, "suppressed" | "recovered">>({})
  const previousTrust = useRef<Record<string, number>>({})
  const previousStatus = useRef<Record<string, string>>({})

  const sorted = [...agents].sort((a, b) => {
    const aSupp = a.status === "suppressed" ? 0 : 1
    const bSupp = b.status === "suppressed" ? 0 : 1
    if (aSupp !== bSupp) return aSupp - bSupp
    return a.trustScore - b.trustScore
  })

  const trustDeltaByAgent = useMemo(() => {
    const latest = new Map<string, { current: number; previous: number }>()
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i]
      if (event.type !== "trust_update" || !event.agentId) continue
      const metadata = event.metadata ?? {}
      const trustAfter = metadata.trustAfter
      const trustBefore = metadata.trustBefore
      if (typeof trustAfter !== "number" || typeof trustBefore !== "number") continue
      if (!latest.has(event.agentId)) {
        latest.set(event.agentId, { current: trustAfter, previous: trustBefore })
      }
    }
    return latest
  }, [events])

  useEffect(() => {
    const trustTimeouts: ReturnType<typeof setTimeout>[] = []
    const statusTimeouts: ReturnType<typeof setTimeout>[] = []

    for (const agent of agents) {
      const prevTrust = previousTrust.current[agent.id]
      if (prevTrust !== undefined && Math.abs(agent.trustScore - prevTrust) > 0.0001) {
        const direction = agent.trustScore > prevTrust ? "up" : "down"
        setTrustFlash((state) => ({ ...state, [agent.id]: direction }))
        trustTimeouts.push(
          setTimeout(() => {
            setTrustFlash((state) => {
              const next = { ...state }
              delete next[agent.id]
              return next
            })
          }, 900),
        )
      }
      previousTrust.current[agent.id] = agent.trustScore

      const prevStatus = previousStatus.current[agent.id]
      if (prevStatus && prevStatus !== agent.status) {
        const tone = agent.status === "suppressed" ? "suppressed" : "recovered"
        setStatusFlash((state) => ({ ...state, [agent.id]: tone }))
        statusTimeouts.push(
          setTimeout(() => {
            setStatusFlash((state) => {
              const next = { ...state }
              delete next[agent.id]
              return next
            })
          }, 1200),
        )
      }
      previousStatus.current[agent.id] = agent.status
    }

    return () => {
      for (const timeout of trustTimeouts) clearTimeout(timeout)
      for (const timeout of statusTimeouts) clearTimeout(timeout)
    }
  }, [agents])

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Agent Registry</h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{agents.length} agents</span>
          <span>Trust threshold: {formatThreshold(trustThreshold)}</span>
        </div>
      </div>

      {agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agent data yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Trust</TableHead>
              <TableHead className="w-[80px] text-center">Trend</TableHead>
              <TableHead className="text-right">Delta</TableHead>
              <TableHead className="text-right">Authority</TableHead>
              <TableHead className="w-[80px]">Sparkline</TableHead>
              <TableHead>Breach</TableHead>
              <TableHead className="text-right">Capabilities</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((agent) => {
              const trustDelta = trustDeltaByAgent.get(agent.id)
              const deltaValue = trustDelta ? trustDelta.current - trustDelta.previous : 0
              const deltaClass =
                Math.abs(deltaValue) < 0.0005
                  ? "text-muted-foreground"
                  : deltaValue > 0
                    ? "text-emerald-400"
                    : "text-red-400"
              const trustFlashClass =
                trustFlash[agent.id] === "up"
                  ? "trust-flash-up"
                  : trustFlash[agent.id] === "down"
                    ? "trust-flash-down"
                    : ""
              const statusClass =
                statusFlash[agent.id] === "suppressed"
                  ? "row-suppressed-flash"
                  : statusFlash[agent.id] === "recovered"
                    ? "row-recovered-flash"
                    : ""
              return (
              <TableRow key={agent.id} className={`cursor-pointer transition-colors ${statusClass}`}>
                <TableCell>
                  <Link
                    href={`/agents/${agent.id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {agent.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={agent.status} />
                </TableCell>
                <TableCell
                  className={[
                    "text-right font-mono text-sm transition-all duration-300",
                    trustFlashClass,
                    agent.status === "suppressed" ? "opacity-70" : "",
                  ].join(" ")}
                >
                  {formatScore(agent.trustScore)}
                </TableCell>
                <TableCell className="text-center">
                  <TrendArrow agentId={agent.id} />
                </TableCell>
                <TableCell className={`text-right font-mono text-xs ${deltaClass}`}>
                  {formatDelta(deltaValue)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatScore(agent.authorityWeight)}
                </TableCell>
                <TableCell>
                  <TrustSparkline agentId={agent.id} />
                </TableCell>
                <TableCell>
                  <BreachIndicator
                    trustScore={agent.trustScore}
                    threshold={trustThreshold}
                  />
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {agent.capabilities?.join(", ") || "\u2014"}
                </TableCell>
              </TableRow>
            )})}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
