"use client"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { DataGuard } from "@/components/control-plane/DataGuard"
import { IncidentTimeline } from "@/components/control-plane/IncidentTimeline"
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
  const sequence = useGovernanceStore((s) => s.snapshot?.sequence)
  const events = useGovernanceStore((s) => s.events)
  const history = useGovernanceStore((s) => s.history)
  const mutateThresholds = useGovernanceStore((s) => s.mutateThresholds)

  const [draftTrust, setDraftTrust] = useState("")
  const [draftSuppression, setDraftSuppression] = useState("")
  const [draftDrift, setDraftDrift] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [editSuccess, setEditSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!thresholds) return
    setDraftTrust(thresholds.trustThreshold.toFixed(3))
    setDraftSuppression(thresholds.suppressionThreshold.toFixed(3))
    setDraftDrift(thresholds.driftDelta.toFixed(3))
  }, [thresholds?.trustThreshold, thresholds?.suppressionThreshold, thresholds?.driftDelta])

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

  const parsedDraft = useMemo(() => {
    return {
      trustThreshold: Number.parseFloat(draftTrust),
      suppressionThreshold: Number.parseFloat(draftSuppression),
      driftDelta: Number.parseFloat(draftDrift),
    }
  }, [draftDrift, draftSuppression, draftTrust])

  const canSubmit = useMemo(() => {
    if (!thresholds) return false
    if (
      !Number.isFinite(parsedDraft.trustThreshold) ||
      !Number.isFinite(parsedDraft.suppressionThreshold) ||
      !Number.isFinite(parsedDraft.driftDelta)
    ) return false
    if (parsedDraft.trustThreshold < 0.5 || parsedDraft.trustThreshold > 0.95) return false

    const trustDelta = Math.abs(parsedDraft.trustThreshold - thresholds.trustThreshold)
    const suppressionDelta = Math.abs(parsedDraft.suppressionThreshold - thresholds.suppressionThreshold)
    const driftDelta = Math.abs(parsedDraft.driftDelta - thresholds.driftDelta)
    return Math.max(trustDelta, suppressionDelta, driftDelta) <= 0.05
  }, [parsedDraft, thresholds])

  function handleApplyThresholdMutation() {
    setEditError(null)
    setEditSuccess(null)
    if (!thresholds) {
      setEditError("No active thresholds available.")
      return
    }
    if (
      !Number.isFinite(parsedDraft.trustThreshold) ||
      !Number.isFinite(parsedDraft.suppressionThreshold) ||
      !Number.isFinite(parsedDraft.driftDelta)
    ) {
      setEditError("All threshold values must be valid numbers.")
      return
    }

    const next = {
      trustThreshold: parsedDraft.trustThreshold,
      suppressionThreshold: parsedDraft.suppressionThreshold,
      driftDelta: parsedDraft.driftDelta,
    }

    const result = mutateThresholds(next)
    if (!result.ok) {
      setEditError(result.error)
      return
    }
    const nextCycle = (sequence ?? history.length - 1) + 1
    setEditSuccess(`Mutation decision emitted for cycle ${nextCycle}.`)
  }

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
            <h2 className="text-base font-semibold mb-1">Threshold Editor</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Bounded editing with governance guardrails.
            </p>
            <Separator className="mb-4" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">trustThreshold (0.50-0.95)</label>
                <Input
                  type="number"
                  min={0.5}
                  max={0.95}
                  step={0.001}
                  value={draftTrust}
                  onChange={(e) => setDraftTrust(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">suppressionThreshold</label>
                <Input
                  type="number"
                  step={0.001}
                  value={draftSuppression}
                  onChange={(e) => setDraftSuppression(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">driftDelta</label>
                <Input
                  type="number"
                  step={0.001}
                  value={draftDrift}
                  onChange={(e) => setDraftDrift(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Constraint: per-edit absolute delta for each threshold must be ≤ 0.05 from the previous cycle.
            </div>
            {editError && (
              <div className="mt-2 text-xs text-red-600">{editError}</div>
            )}
            {editSuccess && (
              <div className="mt-2 text-xs text-emerald-600">{editSuccess}</div>
            )}
            <div className="mt-4 flex justify-end">
              <Button onClick={handleApplyThresholdMutation} disabled={!canSubmit}>
                Apply Threshold Mutation
              </Button>
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

          <IncidentTimeline events={events} history={history} />

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
