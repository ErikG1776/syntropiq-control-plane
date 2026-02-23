"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { DataGuard } from "@/components/control-plane/DataGuard"
import { useGovernanceStore } from "@/store/governance-store"

function formatThreshold(v: number | undefined): string {
  if (v === undefined || v < 0) return "\u2014"
  return v.toFixed(3)
}

function ThresholdAvailability({ v }: { v: number | undefined }) {
  const available = v !== undefined && v >= 0
  return (
    <Badge
      variant={available ? "default" : "secondary"}
      className="text-[10px] px-1.5 py-0"
    >
      {available ? "active" : "unavailable"}
    </Badge>
  )
}

export default function ThresholdsPage() {
  const thresholds = useGovernanceStore((s) => s.snapshot?.thresholds)
  const events = useGovernanceStore((s) => s.events)

  const mutationEvents = events
    .filter((e) => e.type === "mutation")
    .slice(-50)
    .reverse()

  const thresholdBreaches = events
    .filter((e) => e.type === "threshold_breach")
    .slice(-20)
    .reverse()

  const thresholdRows = [
    { label: "Trust Threshold", value: thresholds?.trustThreshold, description: "Minimum trust score before agent enters probation" },
    { label: "Suppression Threshold", value: thresholds?.suppressionThreshold, description: "Trust level below which agents are suppressed" },
    { label: "Drift Delta", value: thresholds?.driftDelta, description: "Maximum allowed trust drift between cycles" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Thresholds</h1>
        <p className="text-sm text-muted-foreground">
          Active governance thresholds for trust, suppression, and drift.
        </p>
      </div>

      <DataGuard emptyMessage="Connect a source to view threshold policies.">
        <>
          <Card className="p-5">
            <h2 className="text-base font-semibold mb-4">Active Thresholds</h2>
            <div className="space-y-4">
              {thresholdRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{row.label}</div>
                    <div className="text-xs text-muted-foreground">{row.description}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-lg font-semibold">
                      {formatThreshold(row.value)}
                    </span>
                    <ThresholdAvailability v={row.value} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold mb-1">Mutation History</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Recent mutation events from the governance stream
            </p>
            <Separator className="mb-4" />
            {mutationEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No mutation events recorded.</p>
            ) : (
              <div className="space-y-2 text-sm">
                {mutationEvents.map((e) => (
                  <div key={e.id} className="rounded border px-3 py-2">
                    <div className="flex items-center justify-between text-xs">
                      <Badge variant="outline" className="text-[10px]">mutation</Badge>
                      <span className="text-muted-foreground">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="mt-1">{e.message}</div>
                    {e.agentId && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Agent: {e.agentId}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {thresholdBreaches.length > 0 && (
            <Card className="p-5">
              <h2 className="text-base font-semibold mb-4">Recent Breaches</h2>
              <div className="space-y-2 text-sm">
                {thresholdBreaches.map((e) => (
                  <div key={e.id} className="rounded border border-red-500/30 px-3 py-2">
                    <div className="flex items-center justify-between text-xs">
                      <Badge variant="destructive" className="text-[10px]">breach</Badge>
                      <span className="text-muted-foreground">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="mt-1">{e.message}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      </DataGuard>
    </div>
  )
}
