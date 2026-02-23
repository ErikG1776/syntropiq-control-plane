"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Select } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import type { AgentState, GovernanceThresholds } from "@/lib/governance/schema"
import { useGovernanceStore } from "@/store/governance-store"
import replayScenarios from "@/public/replays/scenarios/index.json"

type JsonRecord = Record<string, unknown>

interface DecisionView {
  id: string
  action: string
  rationale: string
  severity: string
  agentId?: string
}

interface CycleView {
  cycleId: number
  timestamp: string
  inputsAgentStates: AgentState[]
  outputsAgentStates: AgentState[]
  decisions: DecisionView[]
  thresholdsBefore: GovernanceThresholds
  thresholdsAfter: GovernanceThresholds
  stability: number
}

const EMPTY_THRESHOLDS: GovernanceThresholds = {
  trustThreshold: -1,
  suppressionThreshold: -1,
  driftDelta: -1,
}

interface ReplayScenarioIndexEntry {
  id: string
  label: string
  description: string
  file: string
}

const replayPathBySource: Record<string, string> = Object.fromEntries(
  (replayScenarios as ReplayScenarioIndexEntry[]).map((scenario) => [
    `replay_${scenario.id}`,
    scenario.file,
  ]),
)

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function normalizeThresholds(raw: unknown): GovernanceThresholds {
  const src = asRecord(raw)
  return {
    trustThreshold: asNumber(src.trustThreshold ?? src.trust_threshold, -1),
    suppressionThreshold: asNumber(src.suppressionThreshold ?? src.suppression_threshold, -1),
    driftDelta: asNumber(src.driftDelta ?? src.drift_delta, -1),
  }
}

function normalizeAgent(raw: unknown): AgentState {
  const src = asRecord(raw)
  const trustScore = asNumber(src.trustScore ?? src.trust_score ?? src.trust, 0)
  const authorityWeight = asNumber(src.authorityWeight ?? src.authority_weight ?? src.authority, trustScore)
  const statusRaw = asString(src.status, "unknown")
  const status =
    statusRaw === "active" || statusRaw === "probation" || statusRaw === "suppressed"
      ? statusRaw
      : "unknown"

  return {
    id: asString(src.id, "unknown_agent"),
    trustScore,
    authorityWeight,
    status,
  }
}

function computeWeightedStability(agents: AgentState[]): number {
  const total = agents.reduce((acc, a) => acc + a.authorityWeight, 0)
  if (total <= 0) return 0
  return agents.reduce((acc, a) => acc + a.trustScore * a.authorityWeight, 0) / total
}

function deriveAction(type: string): string {
  switch (type) {
    case "suppression":
      return "suppress_agent"
    case "probation":
      return "set_probation"
    case "mutation":
      return "mutate_thresholds"
    case "status_change":
      return "transition_agent_status"
    case "routing_freeze":
      return "freeze_routing"
    case "threshold_breach":
      return "raise_threshold_alert"
    case "trust_update":
      return "update_trust"
    case "heartbeat":
      return "record_heartbeat"
    default:
      return "record_event"
  }
}

function normalizeDecisions(rawDecisions: unknown, rawEvents: unknown): DecisionView[] {
  const decisions = asArray(rawDecisions)
  if (decisions.length > 0) {
    return decisions.map((d, idx) => {
      const src = asRecord(d)
      const decisionType = asString(src.decisionType ?? src.type, "system_alert")
      return {
        id: asString(src.decisionId ?? src.id, `decision_${idx}`),
        action: asString(src.action, deriveAction(decisionType)),
        rationale: asString(src.rationale ?? src.message, "Derived decision"),
        severity: asString(src.severity, "info"),
        agentId: asString(src.agentId ?? src.agent_id) || undefined,
      }
    })
  }

  return asArray(rawEvents).map((e, idx) => {
    const src = asRecord(e)
    const type = asString(src.type, "system_alert")
    const metadata = asRecord(src.metadata)
    const decision = asRecord(metadata.decision ?? metadata)
    const action = asString(decision.action, deriveAction(type))
    let rationale = asString(src.message, "Derived from cycle event")
    if (type === "mutation") {
      const previous = asRecord(decision.previous)
      const updated = asRecord(decision.updated)
      const before = asNumber(previous.trustThreshold ?? previous.trust_threshold, Number.NaN)
      const after = asNumber(updated.trustThreshold ?? updated.trust_threshold, Number.NaN)
      if (Number.isFinite(before) && Number.isFinite(after)) {
        rationale = `${rationale} (trustThreshold ${before.toFixed(3)} -> ${after.toFixed(3)})`
      }
    }
    return {
      id: asString(src.id, `event_${idx}`),
      action,
      rationale,
      severity: asString(src.severity, "info"),
      agentId: asString(src.agentId ?? src.agent_id) || undefined,
    }
  })
}

function formatThreshold(value: number): string {
  return value >= 0 ? value.toFixed(3) : "-"
}

function formatDelta(value: number): string {
  if (Number.isNaN(value)) return "-"
  if (value > 0) return `+${value.toFixed(3)}`
  return value.toFixed(3)
}

function formatTs(ts: string): string {
  const parsed = Date.parse(ts)
  if (!Number.isFinite(parsed)) return ts
  return new Date(parsed).toLocaleTimeString()
}

function buildCyclesFromReplay(json: unknown): CycleView[] {
  const root = asRecord(json)
  const timeline = asArray(root.timeline)
  let prevOutputs: AgentState[] = []
  let prevThresholds: GovernanceThresholds = EMPTY_THRESHOLDS

  return timeline.map((entry, idx) => {
    const frame = asRecord(entry)
    const inputs = asRecord(frame.inputs)
    const outputs = asRecord(frame.outputs)
    const cycleId = asNumber(
      frame.cycleId ?? frame.cycle ?? frame.frame ?? frame.cycleNumber,
      idx,
    )
    const outputsAgentStates = (
      asArray(outputs.agentStates).length > 0 ? asArray(outputs.agentStates) : asArray(frame.agents)
    ).map(normalizeAgent)
    const inputsAgentStates = (
      asArray(inputs.agentStates).length > 0 ? asArray(inputs.agentStates) : prevOutputs
    ).map(normalizeAgent)
    const thresholdsAfter = normalizeThresholds(outputs.thresholds ?? frame.thresholds)
    const thresholdsBefore = normalizeThresholds(inputs.thresholds ?? prevThresholds)
    const decisions = normalizeDecisions(frame.decisions, frame.events)
    const metrics = asRecord(frame.metrics)
    const stability = asNumber(metrics.stability, computeWeightedStability(outputsAgentStates))

    prevOutputs = outputsAgentStates
    prevThresholds = thresholdsAfter

    return {
      cycleId,
      timestamp: asString(frame.timestamp, ""),
      inputsAgentStates,
      outputsAgentStates,
      decisions,
      thresholdsBefore,
      thresholdsAfter,
      stability,
    }
  })
}

function buildCyclesFromHistory(
  history: ReturnType<typeof useGovernanceStore.getState>["history"],
  events: ReturnType<typeof useGovernanceStore.getState>["events"],
): CycleView[] {
  return history.map((snap, idx) => {
    const prev = idx > 0 ? history[idx - 1] : null
    const cycleEvents = events.filter((evt) => evt.timestamp === snap.timestamp)
    const decisions = normalizeDecisions([], cycleEvents)

    return {
      cycleId: snap.sequence ?? idx,
      timestamp: snap.timestamp,
      inputsAgentStates: prev?.agents ?? snap.agents,
      outputsAgentStates: snap.agents,
      decisions,
      thresholdsBefore: prev?.thresholds ?? snap.thresholds,
      thresholdsAfter: snap.thresholds,
      stability: computeWeightedStability(snap.agents),
    }
  })
}

function AgentStateTable({ title, agents }: { title: string; agents: AgentState[] }) {
  return (
    <div className="rounded border p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </h4>
      <div className="space-y-1">
        {agents.length === 0 ? (
          <div className="text-xs text-muted-foreground">No agent states</div>
        ) : (
          agents.map((agent) => (
            <div
              key={`${title}-${agent.id}`}
              className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-xs"
            >
              <span className="font-mono">{agent.id}</span>
              <span>{agent.trustScore.toFixed(3)}</span>
              <span>{agent.authorityWeight.toFixed(3)}</span>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
                {agent.status}
              </Badge>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export function CycleInspector() {
  const source = useGovernanceStore((s) => s.source)
  const history = useGovernanceStore((s) => s.history)
  const events = useGovernanceStore((s) => s.events)
  const [replayCycles, setReplayCycles] = useState<CycleView[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    let cancelled = false
    const replayPath = source ? replayPathBySource[source] : undefined
    if (!replayPath) {
      setReplayCycles([])
      return
    }

    ;(async () => {
      try {
        const res = await fetch(replayPath, { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()
        const cycles = buildCyclesFromReplay(json)
        if (!cancelled) setReplayCycles(cycles)
      } catch {
        if (!cancelled) setReplayCycles([])
      }
    })()

    return () => {
      cancelled = true
    }
  }, [source])

  const cycles = useMemo(() => {
    const storeCycles = buildCyclesFromHistory(history, events)
    if (replayCycles.length === 0) return storeCycles

    const maxReplayCycleId = Math.max(...replayCycles.map((cycle) => cycle.cycleId))
    const appendedStoreCycles = storeCycles.filter(
      (cycle) => cycle.cycleId > maxReplayCycleId,
    )

    return [...replayCycles, ...appendedStoreCycles]
  }, [events, history, replayCycles])

  useEffect(() => {
    if (cycles.length === 0) {
      setSelectedIndex(0)
      return
    }
    setSelectedIndex(cycles.length - 1)
  }, [cycles.length])

  const selected = cycles[selectedIndex]
  const prev = selectedIndex > 0 ? cycles[selectedIndex - 1] : undefined
  const stabilityDelta = selected && prev ? selected.stability - prev.stability : 0

  const trustDeltas = useMemo(() => {
    if (!selected) return []
    const before = new Map(selected.inputsAgentStates.map((a) => [a.id, a]))
    const after = new Map(selected.outputsAgentStates.map((a) => [a.id, a]))
    const ids = Array.from(new Set([...before.keys(), ...after.keys()]))

    return ids.map((id) => {
      const b = before.get(id)
      const a = after.get(id)
      const trustBefore = b?.trustScore ?? a?.trustScore ?? 0
      const trustAfter = a?.trustScore ?? b?.trustScore ?? 0
      return {
        id,
        trustBefore,
        trustAfter,
        delta: trustAfter - trustBefore,
      }
    })
  }, [selected])

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2 className="text-base font-semibold">Cycle Inspector</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Cycle</span>
          <Select
            className="h-8 w-36 text-xs"
            value={String(selectedIndex)}
            onChange={(e) => setSelectedIndex(Number(e.target.value))}
            disabled={cycles.length === 0}
          >
            {cycles.map((cycle, idx) => (
              <option key={`${cycle.cycleId}-${idx}`} value={idx}>
                {cycle.cycleId}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Inspect cycle inputs, decisions, outputs, thresholds, and deltas.
      </p>
      <Separator className="mb-4" />

      {!selected ? (
        <p className="text-sm text-muted-foreground">
          No cycle data available yet. Connect a source to inspect governance cycles.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded border p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Cycle ID</div>
              <div className="mt-1 text-sm font-semibold">{selected.cycleId}</div>
              <div className="mt-1 text-xs text-muted-foreground">{formatTs(selected.timestamp)}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Stability</div>
              <div className="mt-1 text-sm font-semibold">{selected.stability.toFixed(4)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Delta {formatDelta(stabilityDelta)}
              </div>
            </div>
            <div className="rounded border p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Decisions</div>
              <div className="mt-1 text-sm font-semibold">{selected.decisions.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {selected.outputsAgentStates.length} agents after execution
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded border p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Thresholds Before
              </h4>
              <div className="space-y-1 text-xs">
                <div>trustThreshold: {formatThreshold(selected.thresholdsBefore.trustThreshold)}</div>
                <div>
                  suppressionThreshold: {formatThreshold(selected.thresholdsBefore.suppressionThreshold)}
                </div>
                <div>driftDelta: {formatThreshold(selected.thresholdsBefore.driftDelta)}</div>
              </div>
            </div>
            <div className="rounded border p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Thresholds After
              </h4>
              <div className="space-y-1 text-xs">
                <div>trustThreshold: {formatThreshold(selected.thresholdsAfter.trustThreshold)}</div>
                <div>
                  suppressionThreshold: {formatThreshold(selected.thresholdsAfter.suppressionThreshold)}
                </div>
                <div>driftDelta: {formatThreshold(selected.thresholdsAfter.driftDelta)}</div>
              </div>
            </div>
          </div>

          <div className="rounded border p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Decisions
            </h4>
            <div className="space-y-2">
              {selected.decisions.length === 0 ? (
                <div className="text-xs text-muted-foreground">No decisions recorded for this cycle.</div>
              ) : (
                selected.decisions.map((decision) => (
                  <div key={decision.id} className="rounded border px-2 py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                        {decision.action}
                      </Badge>
                      <span className="text-muted-foreground">{decision.severity}</span>
                      {decision.agentId && (
                        <span className="font-mono text-muted-foreground">{decision.agentId}</span>
                      )}
                    </div>
                    <div className="mt-1">{decision.rationale}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <AgentStateTable title="Inputs Agent States" agents={selected.inputsAgentStates} />
            <AgentStateTable title="Outputs Agent States" agents={selected.outputsAgentStates} />
          </div>

          <div className="rounded border p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Trust Delta (Before vs After)
            </h4>
            <div className="space-y-1">
              {trustDeltas.map((row) => (
                <div key={row.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-xs">
                  <span className="font-mono">{row.id}</span>
                  <span>{row.trustBefore.toFixed(3)}</span>
                  <span>{row.trustAfter.toFixed(3)}</span>
                  <span className={row.delta < 0 ? "text-red-600" : row.delta > 0 ? "text-emerald-600" : ""}>
                    {formatDelta(row.delta)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
