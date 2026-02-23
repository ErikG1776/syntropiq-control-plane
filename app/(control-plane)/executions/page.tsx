"use client"

import { Card } from "@/components/ui/card"
import { DataGuard } from "@/components/control-plane/DataGuard"
import { CycleInspector } from "@/components/control-plane/CycleInspector"
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

          <CycleInspector />

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
