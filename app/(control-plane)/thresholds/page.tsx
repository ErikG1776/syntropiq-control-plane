"use client"

import { Card } from "@/components/ui/card"
import { useGovernanceStore } from "@/store/governance-store"

export default function ThresholdsPage() {
  const connected = useGovernanceStore((s) => s.connected)
  const thresholds = useGovernanceStore((s) => s.snapshot?.thresholds)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Thresholds</h1>
        <p className="text-sm text-muted-foreground">
          Active governance thresholds for trust, suppression, and drift.
        </p>
      </div>

      {!connected ? (
        <Card className="p-5 text-sm text-muted-foreground">
          Connect a source to view threshold policies.
        </Card>
      ) : (
        <Card className="p-5">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Trust Threshold</span>
              <span className="font-medium">{thresholds?.trustThreshold ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Suppression Threshold</span>
              <span className="font-medium">{thresholds?.suppressionThreshold ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Drift Delta</span>
              <span className="font-medium">{thresholds?.driftDelta ?? 0}</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
