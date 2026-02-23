"use client"

import { useCallback } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { useGovernanceStore } from "@/store/governance-store"
import { toast } from "sonner"

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function snapshotToCSV(
  store: ReturnType<typeof useGovernanceStore.getState>,
): string {
  const agents = store.snapshot?.agents ?? []
  const header = "id,status,trustScore,authorityWeight,capabilities,lastDecisionAt"
  const rows = agents.map(
    (a) =>
      `${a.id},${a.status},${a.trustScore},${a.authorityWeight},"${(a.capabilities ?? []).join(";")}",${a.lastDecisionAt ?? ""}`,
  )
  return [header, ...rows].join("\n")
}

function eventsToCSV(
  store: ReturnType<typeof useGovernanceStore.getState>,
): string {
  const events = store.events
  const header = "id,timestamp,type,severity,message,agentId,tags"
  const rows = events.map(
    (e) =>
      `${e.id},${e.timestamp},${e.type},${e.severity},"${e.message.replace(/"/g, '""')}",${e.agentId ?? ""},"${(e.tags ?? []).join(";")}"`,
  )
  return [header, ...rows].join("\n")
}

function historyToCSV(
  store: ReturnType<typeof useGovernanceStore.getState>,
): string {
  const history = store.history
  if (history.length === 0) return ""

  // All agent IDs
  const allIds = [...new Set(history.flatMap((s) => s.agents.map((a) => a.id)))].sort()
  const header = `timestamp,${allIds.join(",")}`
  const rows = history.map((snap) => {
    const values = allIds.map((id) => {
      const agent = snap.agents.find((a) => a.id === id)
      return agent ? agent.trustScore.toFixed(4) : ""
    })
    return `${snap.timestamp},${values.join(",")}`
  })
  return [header, ...rows].join("\n")
}

export function ExportMenu() {
  const connected = useGovernanceStore((s) => s.connected)

  const exportAgentsCSV = useCallback(() => {
    const state = useGovernanceStore.getState()
    const csv = snapshotToCSV(state)
    downloadBlob(csv, "agents.csv", "text/csv")
    toast.success("Exported agents to CSV")
  }, [])

  const exportEventsCSV = useCallback(() => {
    const state = useGovernanceStore.getState()
    const csv = eventsToCSV(state)
    downloadBlob(csv, "events.csv", "text/csv")
    toast.success("Exported events to CSV")
  }, [])

  const exportTrustHistoryCSV = useCallback(() => {
    const state = useGovernanceStore.getState()
    const csv = historyToCSV(state)
    if (!csv) {
      toast.error("No history data to export")
      return
    }
    downloadBlob(csv, "trust_history.csv", "text/csv")
    toast.success("Exported trust history to CSV")
  }, [])

  const exportSnapshotJSON = useCallback(() => {
    const state = useGovernanceStore.getState()
    const payload = {
      snapshot: state.snapshot,
      events: state.events,
      stabilityHistory: state.stabilityHistory,
      exportedAt: new Date().toISOString(),
    }
    downloadBlob(JSON.stringify(payload, null, 2), "governance_snapshot.json", "application/json")
    toast.success("Exported full snapshot to JSON")
  }, [])

  const exportFullJSON = useCallback(() => {
    const state = useGovernanceStore.getState()
    const payload = {
      snapshot: state.snapshot,
      events: state.events,
      history: state.history,
      stabilityHistory: state.stabilityHistory,
      source: state.source,
      exportedAt: new Date().toISOString(),
    }
    downloadBlob(JSON.stringify(payload, null, 2), "governance_full_export.json", "application/json")
    toast.success("Exported full dataset to JSON")
  }, [])

  if (!connected) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportAgentsCSV}>
          Agents (CSV)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportEventsCSV}>
          Events (CSV)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportTrustHistoryCSV}>
          Trust History (CSV)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportSnapshotJSON}>
          Current Snapshot (JSON)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportFullJSON}>
          Full Dataset (JSON)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
