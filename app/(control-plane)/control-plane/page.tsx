"use client"

import { AgentRegistryPanel } from "@/components/control-plane/AgentRegistryPanel"
import { EventStreamPanel } from "@/components/control-plane/EventStreamPanel"
import { KpiRow } from "@/components/control-plane/KpiRow"
import { PerSourceHealthPanel } from "@/components/control-plane/PerSourceHealthPanel"
import { StabilityChart } from "@/components/control-plane/StabilityChart"
import { TopBar } from "@/components/control-plane/TopBar"
import { DataGuard } from "@/components/control-plane/DataGuard"
import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-12" />
          </Card>
        ))}
      </div>
      <Card className="p-5 space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-[260px] w-full" />
      </Card>
    </div>
  )
}

export default function ControlPlanePage() {
  return (
    <div className="space-y-6">
      <TopBar />
      <DataGuard skeleton={<DashboardSkeleton />}>
        <div className="space-y-6">
          <KpiRow />
          <PerSourceHealthPanel />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <StabilityChart />
            <EventStreamPanel />
          </div>
          <AgentRegistryPanel />
        </div>
      </DataGuard>
    </div>
  )
}
