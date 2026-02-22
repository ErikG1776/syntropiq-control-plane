"use client"

import { AgentRegistryPanel } from "@/components/control-plane/AgentRegistryPanel"
import { EventStreamPanel } from "@/components/control-plane/EventStreamPanel"
import { KpiRow } from "@/components/control-plane/KpiRow"
import { StabilityChart } from "@/components/control-plane/StabilityChart"
import { TopBar } from "@/components/control-plane/TopBar"

export default function ControlPlanePage() {
  return (
    <div className="space-y-6">
      <TopBar />
      <KpiRow />
      <StabilityChart />
      <AgentRegistryPanel />
      <EventStreamPanel />
    </div>
  )
}
