"use client"

import { useCallback, useState } from "react"
import { useSession } from "next-auth/react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { DataGuard } from "@/components/control-plane/DataGuard"
import { useGovernanceStore } from "@/store/governance-store"
import { toast } from "sonner"

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

type ThresholdKey = "trustThreshold" | "suppressionThreshold" | "driftDelta"

interface ThresholdRowDef {
  key: ThresholdKey
  label: string
  description: string
  min: number
  max: number
  step: number
}

const THRESHOLD_ROWS: ThresholdRowDef[] = [
  {
    key: "trustThreshold",
    label: "Trust Threshold",
    description: "Minimum trust score before agent enters probation",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "suppressionThreshold",
    label: "Suppression Threshold",
    description: "Trust level below which agents are suppressed",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "driftDelta",
    label: "Drift Delta",
    description: "Maximum allowed trust drift between cycles",
    min: 0,
    max: 1,
    step: 0.001,
  },
]

function ThresholdEditor({
  row,
  currentValue,
  canEdit,
  onSave,
}: {
  row: ThresholdRowDef
  currentValue: number | undefined
  canEdit: boolean
  onSave: (key: ThresholdKey, value: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  const startEdit = () => {
    setDraft(currentValue !== undefined && currentValue >= 0 ? currentValue.toString() : "0.5")
    setEditing(true)
  }

  const cancel = () => setEditing(false)

  const save = () => {
    const parsed = parseFloat(draft)
    if (isNaN(parsed) || parsed < row.min || parsed > row.max) {
      toast.error(`Value must be between ${row.min} and ${row.max}`)
      return
    }
    onSave(row.key, parsed)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          min={row.min}
          max={row.max}
          step={row.step}
          className="w-24 h-8 text-right font-mono"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") save()
            if (e.key === "Escape") cancel()
          }}
        />
        <Button size="sm" variant="default" className="h-7 text-xs" onClick={save}>
          Apply
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancel}>
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-lg font-semibold">
        {formatThreshold(currentValue)}
      </span>
      <ThresholdAvailability v={currentValue} />
      {canEdit && (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={startEdit}>
          Edit
        </Button>
      )}
    </div>
  )
}

export default function ThresholdsPage() {
  const thresholds = useGovernanceStore((s) => s.snapshot?.thresholds)
  const events = useGovernanceStore((s) => s.events)
  const { data: session } = useSession()
  const [pendingOverrides, setPendingOverrides] = useState<
    Partial<Record<ThresholdKey, number>>
  >({})
  const [saving, setSaving] = useState(false)

  const role = session?.user?.role ?? "viewer"
  const canEdit = role === "admin" || role === "operator"

  const mutationEvents = events
    .filter((e) => e.type === "mutation")
    .slice(-50)
    .reverse()

  const thresholdBreaches = events
    .filter((e) => e.type === "threshold_breach")
    .slice(-20)
    .reverse()

  const handleSaveThreshold = useCallback(
    async (key: ThresholdKey, value: number) => {
      setPendingOverrides((prev) => ({ ...prev, [key]: value }))
      setSaving(true)

      try {
        const res = await fetch("/api/control-plane/thresholds", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: value }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `Server returned ${res.status}`)
        }

        toast.success(`${key} updated to ${value.toFixed(3)}`)
      } catch (err) {
        toast.error(
          `Failed to update ${key}: ${err instanceof Error ? err.message : "Unknown error"}`,
        )
        setPendingOverrides((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  const effectiveValue = (key: ThresholdKey): number | undefined => {
    if (key in pendingOverrides) return pendingOverrides[key]
    return thresholds?.[key]
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Thresholds</h1>
        <p className="text-sm text-muted-foreground">
          Active governance thresholds for trust, suppression, and drift.
          {saving && <span className="ml-2 text-xs">(saving...)</span>}
        </p>
      </div>

      <DataGuard emptyMessage="Connect a source to view threshold policies.">
        <>
          <Card className="p-5">
            <h2 className="text-base font-semibold mb-4">Active Thresholds</h2>
            <div className="space-y-4">
              {THRESHOLD_ROWS.map((row) => (
                <div key={row.key} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{row.label}</div>
                    <div className="text-xs text-muted-foreground">{row.description}</div>
                  </div>
                  <ThresholdEditor
                    row={row}
                    currentValue={effectiveValue(row.key)}
                    canEdit={canEdit}
                    onSave={handleSaveThreshold}
                  />
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
