"use client"

import { useMemo, useState } from "react"
import { useGovernanceStore } from "@/store/governance-store"
import {
  customSourceKey,
  type CustomAuthType,
  type CustomDataSource,
  type CustomProtocol,
  useCustomDataSourceStore,
} from "@/store/custom-datasource-store"
import { dataSources } from "@/lib/datasources"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"

export function ConnectSourceDialog() {
  const connect = useGovernanceStore((s) => s.connect)
  const disconnect = useGovernanceStore((s) => s.disconnect)
  const connected = useGovernanceStore((s) => s.connected)
  const source = useGovernanceStore((s) => s.source)
  const connecting = useGovernanceStore((s) => s.connecting)
  const multiSourceMode = useGovernanceStore((s) => s.multiSourceMode)
  const activeSources = useGovernanceStore((s) => s.activeSources)
  const setActiveSources = useGovernanceStore((s) => s.setActiveSources)
  const setMultiSourceMode = useGovernanceStore((s) => s.setMultiSourceMode)
  const customDataSources = useCustomDataSourceStore((s) => s.customDataSources)
  const addCustomDataSource = useCustomDataSourceStore((s) => s.addCustomDataSource)
  const updateCustomDataSource = useCustomDataSourceStore((s) => s.updateCustomDataSource)
  const removeCustomDataSource = useCustomDataSourceStore((s) => s.removeCustomDataSource)
  const [open, setOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [label, setLabel] = useState("")
  const [protocol, setProtocol] = useState<CustomProtocol>("poll")
  const [url, setUrl] = useState("")
  const [pollIntervalMs, setPollIntervalMs] = useState("2000")
  const [authType, setAuthType] = useState<CustomAuthType>("none")
  const [authValue, setAuthValue] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [selectedSources, setSelectedSources] = useState<string[]>([])

  const sources = useMemo(
    () => Object.values(dataSources).map((s) => ({ key: s.key, label: s.label, mode: s.mode })),
    [],
  )
  const customSources = useMemo(
    () =>
      customDataSources.map((s) => ({
        key: customSourceKey(s.id),
        label: s.label,
        mode: s.protocol,
        raw: s,
      })),
    [customDataSources],
  )

  const handleConnect = async (key: string) => {
    await connect(key)
    setOpen(false)
  }

  const handleToggleSelected = (key: string) => {
    setSelectedSources((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  const handleConnectSelected = () => {
    setActiveSources(selectedSources)
    setOpen(false)
  }

  const resetForm = () => {
    setEditingId(null)
    setLabel("")
    setProtocol("poll")
    setUrl("")
    setPollIntervalMs("2000")
    setAuthType("none")
    setAuthValue("")
    setFormError(null)
  }

  const openCreateForm = () => {
    resetForm()
    setFormOpen(true)
  }

  const openEditForm = (ds: CustomDataSource) => {
    setEditingId(ds.id)
    setLabel(ds.label)
    setProtocol(ds.protocol)
    setUrl(ds.url)
    setPollIntervalMs(String(ds.pollIntervalMs ?? 2000))
    setAuthType(ds.authType)
    setAuthValue(ds.authValue ?? "")
    setFormError(null)
    setFormOpen(true)
  }

  const handleSave = () => {
    const trimmedLabel = label.trim()
    const trimmedUrl = url.trim()
    if (!trimmedLabel) {
      setFormError("Label is required.")
      return
    }
    if (!trimmedUrl) {
      setFormError("URL is required.")
      return
    }
    const pollMsParsed = Number.parseInt(pollIntervalMs, 10)
    if (protocol === "poll" && (!Number.isFinite(pollMsParsed) || pollMsParsed < 250)) {
      setFormError("Poll interval must be at least 250 ms.")
      return
    }
    if (authType !== "none" && !authValue.trim()) {
      setFormError("Auth value is required for bearer/apikey.")
      return
    }

    const payload: CustomDataSource = {
      id: editingId ?? `ds_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      label: trimmedLabel,
      protocol,
      url: trimmedUrl,
      pollIntervalMs: protocol === "poll" ? pollMsParsed : undefined,
      authType: protocol === "grpc" ? "none" : authType,
      authValue: protocol === "grpc" || authType === "none" ? undefined : authValue.trim(),
    }

    if (editingId) updateCustomDataSource(editingId, payload)
    else addCustomDataSource(payload)

    setFormOpen(false)
    resetForm()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => {
        setOpen(next)
        if (next) setSelectedSources(activeSources)
      }}>
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
            <Button
              size="sm"
              variant={multiSourceMode ? "default" : "outline"}
              onClick={() => setMultiSourceMode(!multiSourceMode)}
            >
              {multiSourceMode ? "Multi-source mode" : "Single-source mode"}
            </Button>
          </div>
          <Separator />
          <div className="grid gap-3">
            {sources.map((s) => (
              multiSourceMode ? (
                <label key={s.key} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedSources.includes(s.key)}
                      onChange={() => handleToggleSelected(s.key)}
                    />
                    <span>{s.label}</span>
                  </div>
                  <Badge variant="secondary">{s.mode}</Badge>
                </label>
              ) : (
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
              )
            ))}
          </div>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Custom Sources</div>
              <Button size="sm" variant="outline" onClick={openCreateForm}>
                Add Custom Source
              </Button>
            </div>
            {customSources.length === 0 ? (
              <p className="text-xs text-muted-foreground">No custom sources yet.</p>
            ) : (
              <div className="space-y-2">
                {customSources.map((s) => (
                  <div key={s.key} className="rounded border p-2">
                    <div className="flex items-center justify-between gap-2">
                      {multiSourceMode ? (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedSources.includes(s.key)}
                            onChange={() => handleToggleSelected(s.key)}
                          />
                          <span>{s.label}</span>
                        </label>
                      ) : (
                        <button
                          className="text-sm hover:underline text-left"
                          onClick={() => handleConnect(s.key)}
                          disabled={connecting}
                        >
                          {s.label}
                        </button>
                      )}
                      <Badge variant="secondary">{s.mode}</Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEditForm(s.raw)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() => removeCustomDataSource(s.raw.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={disconnect} disabled={connecting}>
              Disconnect
            </Button>
            <div className="flex items-center gap-2">
              {multiSourceMode && (
                <Button
                  size="sm"
                  onClick={handleConnectSelected}
                  disabled={selectedSources.length === 0}
                >
                  Connect Selected
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                {connecting ? "connecting..." : "ready"}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Custom Source" : "Add Custom Source"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Label</label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Protocol</label>
              <Select
                value={protocol}
                onChange={(e) => {
                  const next = e.target.value as CustomProtocol
                  setProtocol(next)
                  if (next === "grpc") {
                    setAuthType("none")
                    setAuthValue("")
                  }
                }}
              >
                <option value="poll">poll</option>
                <option value="sse">sse</option>
                <option value="ws">ws</option>
                <option value="grpc">grpc</option>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">URL</label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            {protocol === "poll" && (
              <div>
                <label className="text-xs text-muted-foreground">Poll Interval (ms)</label>
                <Input
                  type="number"
                  min={250}
                  value={pollIntervalMs}
                  onChange={(e) => setPollIntervalMs(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Auth Type</label>
              <Select
                value={protocol === "grpc" ? "none" : authType}
                onChange={(e) => setAuthType(e.target.value as CustomAuthType)}
                disabled={protocol === "grpc"}
              >
                <option value="none">none</option>
                {protocol !== "grpc" && (
                  <>
                    <option value="bearer">bearer</option>
                    <option value="apikey">apikey</option>
                  </>
                )}
              </Select>
            </div>
            {protocol !== "grpc" && authType !== "none" && (
              <div>
                <label className="text-xs text-muted-foreground">Auth Value</label>
                <Input
                  value={authValue}
                  onChange={(e) => setAuthValue(e.target.value)}
                  type="password"
                />
              </div>
            )}
            {formError && <p className="text-xs text-red-600">{formError}</p>}
          </div>
          <Separator />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => { setFormOpen(false); resetForm() }}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
