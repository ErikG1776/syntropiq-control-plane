"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"

const STORAGE_KEY = "syntropiq_custom_sources"

export interface CustomSource {
  key: string
  label: string
  mode: "poll" | "stream"
  url: string
  pollIntervalMs: number
  authType: "none" | "bearer" | "apikey"
  authToken: string
}

export function loadCustomSources(): CustomSource[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCustomSources(sources: CustomSource[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources))
  } catch { /* private browsing */ }
}

export function removeCustomSource(key: string) {
  const sources = loadCustomSources().filter((s) => s.key !== key)
  saveCustomSources(sources)
}

export function AddCustomSourceDialog({ onAdded }: { onAdded?: () => void }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [url, setUrl] = useState("")
  const [mode, setMode] = useState<"poll" | "stream">("poll")
  const [pollInterval, setPollInterval] = useState("2000")
  const [authType, setAuthType] = useState<"none" | "bearer" | "apikey">("none")
  const [authToken, setAuthToken] = useState("")

  const handleSave = () => {
    if (!label.trim() || !url.trim()) {
      toast.error("Label and URL are required")
      return
    }

    const key = `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now()}`

    const source: CustomSource = {
      key,
      label: label.trim(),
      mode,
      url: url.trim(),
      pollIntervalMs: parseInt(pollInterval) || 2000,
      authType,
      authToken: authToken.trim(),
    }

    const existing = loadCustomSources()
    saveCustomSources([...existing, source])

    toast.success(`Added "${source.label}" — reload to connect`)
    setOpen(false)
    resetForm()
    onAdded?.()
  }

  const resetForm = () => {
    setLabel("")
    setUrl("")
    setMode("poll")
    setPollInterval("2000")
    setAuthType("none")
    setAuthToken("")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add Source</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Custom Datasource</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Label</label>
            <Input
              placeholder="My Backend API"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Endpoint URL</label>
            <Input
              placeholder="https://api.example.com/governance/snapshot"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Protocol</label>
              <Select
                value={mode}
                onChange={(e) => setMode(e.target.value as "poll" | "stream")}
                className="mt-1"
              >
                <option value="poll">REST Polling</option>
                <option value="stream">WebSocket / SSE</option>
              </Select>
            </div>
            {mode === "poll" && (
              <div>
                <label className="text-xs text-muted-foreground">Poll Interval (ms)</label>
                <Input
                  type="number"
                  value={pollInterval}
                  onChange={(e) => setPollInterval(e.target.value)}
                  className="mt-1"
                  min={500}
                  step={500}
                />
              </div>
            )}
          </div>

          <Separator />

          <div>
            <label className="text-xs text-muted-foreground">Authentication</label>
            <Select
              value={authType}
              onChange={(e) => setAuthType(e.target.value as "none" | "bearer" | "apikey")}
              className="mt-1"
            >
              <option value="none">None</option>
              <option value="bearer">Bearer Token</option>
              <option value="apikey">API Key</option>
            </Select>
          </div>

          {authType !== "none" && (
            <div>
              <label className="text-xs text-muted-foreground">
                {authType === "bearer" ? "Bearer Token" : "API Key"}
              </label>
              <Input
                type="password"
                placeholder="Enter token..."
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                className="mt-1"
              />
            </div>
          )}
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Source saved to localStorage
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Source</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Small component to list and remove custom sources. */
export function CustomSourceList({ onRemoved }: { onRemoved?: () => void }) {
  const [sources, setSources] = useState(() => loadCustomSources())

  if (sources.length === 0) return null

  const handleRemove = (key: string) => {
    removeCustomSource(key)
    setSources(loadCustomSources())
    toast.success("Custom source removed")
    onRemoved?.()
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-semibold uppercase">
        Custom Sources
      </div>
      {sources.map((s) => (
        <div
          key={s.key}
          className="flex items-center justify-between rounded border px-3 py-2 text-sm"
        >
          <div className="flex items-center gap-2">
            <span>{s.label}</span>
            <Badge variant="secondary" className="text-[10px]">{s.mode}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">{s.url}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-destructive"
              onClick={() => handleRemove(s.key)}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
