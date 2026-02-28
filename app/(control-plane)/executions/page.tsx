"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { DataGuard } from "@/components/control-plane/DataGuard"
import { executeGovernance } from "@/lib/api/execute-governance"
import { useGovernanceStore } from "@/store/governance-store"

const STRATEGIES = ["highest_trust_v1", "top_n_trust_v1", "round_robin_v1"] as const
const DEFAULT_STRATEGY = ""

type TaskType = "demo" | "fraud_check" | "routing_test" | "custom_json"
const TASK_TYPES: TaskType[] = ["demo", "fraud_check", "routing_test", "custom_json"]

const DEFAULT_CUSTOM_TASK = JSON.stringify(
  {
    type: "demo",
    payload: {
      objective: "Validate mediation routing",
      amount: 1250,
      region: "us-east",
    },
  },
  null,
  2,
)

type MediationResponse = {
  run_id?: string
  cycle_id?: string
  strategy?: string
  selection_strategy?: string
  selected_agent?: string
  selected_agents?: string[]
  authority_after?: Record<string, number>
  authority_distribution?: Record<string, number>
  reason?: string
  [key: string]: unknown
}

type MediationBlock = {
  strategy_name?: string
  selection_strategy?: string
  selected_agents?: unknown
  authority_distribution?: unknown
  authority_after?: unknown
}

function buildTask(taskType: TaskType, customJson: string): { task: unknown; error?: string } {
  if (taskType === "custom_json") {
    try {
      const parsed = JSON.parse(customJson)
      if (!parsed || typeof parsed !== "object") {
        return { task: null, error: "Custom JSON must be an object." }
      }
      return { task: parsed }
    } catch {
      return { task: null, error: "Custom JSON is invalid." }
    }
  }

  if (taskType === "fraud_check") {
    return {
      task: {
        type: "fraud_check",
        payload: {
          account_id: "acct_demo_001",
          amount: 4200,
          currency: "USD",
          channel: "card",
        },
      },
    }
  }

  if (taskType === "routing_test") {
    return {
      task: {
        type: "routing_test",
        payload: {
          destination: "payments",
          priority: "high",
          trace: true,
        },
      },
    }
  }

  if (taskType === "demo") {
    return {
      task: {
        id: `demo-${Date.now()}`,
        impact: 0.7,
        urgency: 0.6,
        risk: 0.3,
        metadata: {
          source: "control-plane-demo",
        },
      },
    }
  }

  return {
    task: {
      id: `demo-${Date.now()}`,
      impact: 0.7,
      urgency: 0.6,
      risk: 0.3,
      metadata: {
        source: "control-plane-demo",
      },
    },
  }
}

export default function ExecutionsPage() {
  const events = useGovernanceStore((s) => s.events)
  const history = useGovernanceStore((s) => s.history)

  const [strategy, setStrategy] = useState<string>(DEFAULT_STRATEGY)
  const [runId, setRunId] = useState("")
  const [taskType, setTaskType] = useState<TaskType>("demo")
  const [customJson, setCustomJson] = useState(DEFAULT_CUSTOM_TASK)
  const [customJsonError, setCustomJsonError] = useState<string | null>(null)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MediationResponse | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)

  const mutationEvents = events.filter((e) => e.type === "mutation")
  const trustUpdates = events.filter((e) => e.type === "trust_update")
  const suppressions = events.filter((e) => e.type === "suppression")

  const mediation: MediationBlock = useMemo(() => {
    if (!result || typeof result.mediation !== "object" || !result.mediation) return {}
    return result.mediation as MediationBlock
  }, [result])

  const strategyUsed = useMemo(() => {
    if (typeof mediation.strategy_name === "string" && mediation.strategy_name) return mediation.strategy_name
    if (typeof mediation.selection_strategy === "string" && mediation.selection_strategy) return mediation.selection_strategy
    if (typeof result?.strategy === "string" && result.strategy) return result.strategy
    return "unknown"
  }, [mediation, result])

  const selectedAgents = useMemo(() => {
    const mediationSelected = mediation.selected_agents
    if (Array.isArray(mediationSelected)) {
      return mediationSelected.filter((agent): agent is string => typeof agent === "string")
    }
    if (Array.isArray(result?.selected_agents)) {
      return result.selected_agents.filter((agent): agent is string => typeof agent === "string")
    }
    return []
  }, [mediation, result])

  const authorityDistribution = useMemo(() => {
    const mediationDistribution =
      mediation.authority_distribution && typeof mediation.authority_distribution === "object"
        ? mediation.authority_distribution
        : mediation.authority_after && typeof mediation.authority_after === "object"
          ? mediation.authority_after
          : null
    const source =
      mediationDistribution ??
      (result?.authority_after && typeof result.authority_after === "object" ? result.authority_after : {})

    const out: Record<string, number> = {}
    for (const [agentId, value] of Object.entries(source)) {
      if (typeof value === "number" && Number.isFinite(value)) out[agentId] = value
    }
    return out
  }, [mediation, result])

  const authorityRows = useMemo(
    () => Object.entries(authorityDistribution).sort((a, b) => b[1] - a[1]),
    [authorityDistribution],
  )

  async function onExecute() {
    setError(null)

    const built = buildTask(taskType, customJson)
    if (built.error) {
      setCustomJsonError(built.error)
      return
    }
    setCustomJsonError(null)

    const payload: { task: unknown; run_id?: string; strategy?: string } = {
      task: built.task,
    }

    const trimmedRunId = runId.trim()
    if (trimmedRunId) payload.run_id = trimmedRunId
    if (strategy) payload.strategy = strategy

    setExecuting(true)
    try {
      const response = await executeGovernance(payload)
      setResult(response.data as MediationResponse)
      setRequestId(response.requestId)
    } catch (err) {
      setResult(null)
      setRequestId(null)
      setError(err instanceof Error ? err.message : "execute_failed")
    } finally {
      setExecuting(false)
    }
  }

  function onReset() {
    setStrategy(DEFAULT_STRATEGY)
    setRunId("")
    setTaskType("demo")
    setCustomJson(DEFAULT_CUSTOM_TASK)
    setCustomJsonError(null)
    setError(null)
    setResult(null)
    setRequestId(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Executions</h1>
        <p className="text-sm text-muted-foreground">
          Governance cycle summaries and task execution history.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Execution Mediation</h2>
          <Button asChild variant="outline" size="sm">
            <Link href={{ pathname: "/events", query: { eventType: "mediation_decision" } }}>
              View latest mediation event
            </Link>
          </Button>
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Strategy override</label>
            <Select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
              <option value={DEFAULT_STRATEGY}>(default)</option>
              {STRATEGIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs text-muted-foreground">Run ID (optional)</label>
            <Input
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              placeholder="leave blank to auto-generate"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Task Type</label>
          <Select value={taskType} onChange={(e) => setTaskType(e.target.value as TaskType)}>
            {TASK_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>

        {taskType === "custom_json" && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Custom Task JSON</label>
            <textarea
              value={customJson}
              onChange={(e) => setCustomJson(e.target.value)}
              rows={10}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {customJsonError && <p className="text-xs text-red-600">{customJsonError}</p>}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={onExecute} disabled={executing}>
            {executing ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                Executing
              </span>
            ) : (
              "Execute"
            )}
          </Button>
          <Button variant="outline" onClick={onReset} disabled={executing}>
            Reset
          </Button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </Card>

      {result && (
        <Card className="p-5 space-y-4">
          <h2 className="text-base font-semibold">Mediation Result</h2>
          <Separator />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Selection</div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <p>Strategy: {strategyUsed}</p>
                {result.run_id && <Badge variant="secondary">run_id: {result.run_id}</Badge>}
                {result.cycle_id && <Badge variant="secondary">cycle_id: {result.cycle_id}</Badge>}
              </div>
              {requestId && (
                <p className="text-xs text-muted-foreground">Request ID: {requestId}</p>
              )}
              {selectedAgents.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedAgents.map((agentId) => (
                    <Badge key={agentId} variant="secondary">
                      {agentId}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No selected agents returned.</div>
              )}
              {typeof result.reason === "string" && (
                <p className="text-xs text-muted-foreground">reason: {result.reason}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Authority After</div>
              {authorityRows.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  No authority distribution provided by backend.
                </div>
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

          <details className="rounded border p-3 text-xs">
            <summary className="cursor-pointer font-medium">Raw Response</summary>
            <pre className="mt-2 overflow-auto">{JSON.stringify(result, null, 2)}</pre>
          </details>
        </Card>
      )}

      <DataGuard emptyMessage="Connect a source to view execution history.">
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Cycles Observed
              </div>
              <div className="mt-2 text-2xl font-semibold">{history.length}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Trust Updates
              </div>
              <div className="mt-2 text-2xl font-semibold">{trustUpdates.length}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Mutations
              </div>
              <div className="mt-2 text-2xl font-semibold">{mutationEvents.length}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Suppressions
              </div>
              <div className="mt-2 text-2xl font-semibold">{suppressions.length}</div>
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="text-base font-semibold mb-1">Recent Governance Cycles</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Last {Math.min(history.length, 20)} observed snapshots
            </p>
            <Separator className="mb-4" />

            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No cycle data yet. Data will appear as governance snapshots arrive.
              </p>
            ) : (
              <div className="space-y-2">
                {history.slice(-20).reverse().map((snap, idx) => {
                  const activeCount = snap.agents.filter((a) => a.status === "active").length
                  const suppressedCount = snap.suppressedCount
                  const avgTrust =
                    snap.agents.length > 0
                      ? snap.agents.reduce((s, a) => s + a.trustScore, 0) / snap.agents.length
                      : 0

                  return (
                    <div
                      key={`${snap.timestamp}-${idx}`}
                      className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground w-6">
                          {snap.sequence ?? idx + 1}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(snap.timestamp).toLocaleTimeString()}
                        </span>
                        <Badge variant={snap.healthy !== false ? "default" : "destructive"}>
                          {snap.healthy !== false ? "healthy" : "unhealthy"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{snap.agents.length} agents</span>
                        <span>{activeCount} active</span>
                        {suppressedCount > 0 && (
                          <span className="text-red-500">{suppressedCount} suppressed</span>
                        )}
                        <span>avg trust: {avgTrust.toFixed(3)}</span>
                        <span>{snap.eventCount} events</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </>
      </DataGuard>
    </div>
  )
}
