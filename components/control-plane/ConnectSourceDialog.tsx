"use client"

import { useCallback, useMemo, useState } from "react"
import { useGovernanceStore } from "@/store/governance-store"
import { dataSources } from "@/lib/datasources"
import type { DataSourceKey } from "@/lib/governance/schema"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  AddCustomSourceDialog,
  CustomSourceList,
  loadCustomSources,
} from "@/components/control-plane/AddCustomSourceDialog"

export function ConnectSourceDialog() {
  const { connect, disconnect, connected, source, connecting } = useGovernanceStore()
  const [open, setOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const builtInSources = useMemo(
    () => Object.values(dataSources).map((s) => ({ key: s.key, label: s.label, mode: s.mode })),
    [],
  )

  const customSources = useMemo(() => loadCustomSources(), [refreshKey])

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  const handleConnect = async (key: DataSourceKey) => {
    await connect(key)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          {connected ? "Switch Source" : "Connect Source"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect Governance Source</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Current:</span>
          <Badge variant={connected ? "default" : "secondary"}>
            {source ?? "none"}
          </Badge>
        </div>
        <Separator />

        {/* Built-in sources */}
        <div className="grid gap-2">
          <div className="text-xs text-muted-foreground font-semibold uppercase">
            Built-in Sources
          </div>
          {builtInSources.map((s) => (
            <Button
              key={s.key}
              variant="outline"
              className="h-auto justify-between py-3"
              disabled={connecting}
              onClick={() => handleConnect(s.key as DataSourceKey)}
            >
              <span>{s.label}</span>
              <Badge variant="secondary">{s.mode}</Badge>
            </Button>
          ))}
        </div>

        {/* Custom sources */}
        {customSources.length > 0 && (
          <>
            <Separator />
            <CustomSourceList onRemoved={handleRefresh} />
          </>
        )}

        <Separator />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={disconnect} disabled={connecting}>
              Disconnect
            </Button>
            <AddCustomSourceDialog onAdded={handleRefresh} />
          </div>
          <span className="text-xs text-muted-foreground">
            {connecting ? "connecting..." : "ready"}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
