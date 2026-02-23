"use client"

import { IncidentTimeline } from "@/components/control-plane/IncidentTimeline"
import { CycleInspector } from "@/components/control-plane/CycleInspector"
import { DataGuard } from "@/components/control-plane/DataGuard"

export default function IncidentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>
        <p className="text-sm text-muted-foreground">
          Governance incidents, timeline visualization, and cycle inspection.
        </p>
      </div>

      <DataGuard emptyMessage="Connect a source to view incidents and governance cycles.">
        <div className="space-y-6">
          <IncidentTimeline />
          <CycleInspector />
        </div>
      </DataGuard>
    </div>
  )
}
