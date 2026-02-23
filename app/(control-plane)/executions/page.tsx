"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { DataGuard } from "@/components/control-plane/DataGuard"
import { useGovernanceStore } from "@/store/governance-store"

export default function ExecutionsPage() {
  const events = useGovernanceStore((s) => s.events)
  const history = useGovernanceStore((s) => s.history)

  const mutationEvents = events.filter((e) => e.type === "mutation")
  const trustUpdates = events.filter((e) => e.type === "trust_update")
  const suppressions = events.filter((e) => e.type === "suppression")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Executions</h1>
        <p className="text-sm text-muted-foreground">
          Governance cycle summaries and task execution history.
        </p>
      </div>

      <DataGuard emptyMessage="Connect a source to view execution history.">
        <>
          {/* Summary stats */}
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

          {/* Recent cycles from snapshot history */}
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

          {/* Future: Task submission panel */}
          <Card className="p-5 border-dashed">
            <h2 className="text-base font-semibold mb-1 text-muted-foreground">
              Task Submission
            </h2>
            <p className="text-xs text-muted-foreground">
              Submit governance tasks via POST /api/v1/tasks/submit. This panel will be enabled when RBAC controls are in place.
            </p>
          </Card>
        </>
      </DataGuard>
    </div>
  )
}
