"use client"

import { useMemo, useState } from "react"
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

export function ConnectSourceDialog() {
  const { connect, disconnect, connected, source, connecting } = useGovernanceStore()
  const [open, setOpen] = useState(false)
  const sources = useMemo(
    () => Object.values(dataSources).map((s) => ({ key: s.key, label: s.label, mode: s.mode })),
    [],
  )

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
      <DialogContent className="max-w-xl">
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
        <div className="grid gap-3">
          {sources.map((s) => (
            <Button
              key={s.key}
              variant="outline"
              className="h-auto justify-between py-3"
              disabled={connecting}
              onClick={() => handleConnect(s.key)}
            >
              <span>{s.label}</span>
              <Badge variant="secondary">{s.mode}</Badge>
            </Button>
          ))}
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={disconnect} disabled={connecting}>
            Disconnect
          </Button>
          <span className="text-xs text-muted-foreground">
            {connecting ? "connecting..." : "ready"}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
