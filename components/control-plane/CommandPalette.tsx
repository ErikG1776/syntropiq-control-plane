"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import { useGovernanceStore } from "@/store/governance-store"
import { useAgentFilter } from "@/store/filter-store"
import { useTheme } from "next-themes"
import { dataSources } from "@/lib/datasources"
import type { DataSourceKey } from "@/lib/governance/schema"

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { setTheme } = useTheme()
  const snapshot = useGovernanceStore((s) => s.snapshot)
  const events = useGovernanceStore((s) => s.events)
  const connect = useGovernanceStore((s) => s.connect)
  const disconnect = useGovernanceStore((s) => s.disconnect)
  const connected = useGovernanceStore((s) => s.connected)
  const [, setAgentId] = useAgentFilter()

  // Cmd+K / Ctrl+K to toggle
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  const runAndClose = useCallback(
    (fn: () => void) => {
      fn()
      setOpen(false)
    },
    [],
  )

  const agents = snapshot?.agents ?? []
  const recentEvents = events.slice(-20).reverse()

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed inset-0 z-50"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />

      {/* Dialog */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg bg-popover border rounded-lg shadow-lg overflow-hidden">
        <Command.Input
          placeholder="Search agents, events, actions..."
          className="w-full px-4 py-3 text-sm bg-transparent border-b outline-none placeholder:text-muted-foreground"
        />

        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>

          {/* Navigation */}
          <Command.Group
            heading="Navigation"
            className="px-2 py-1.5 text-xs text-muted-foreground"
          >
            {[
              { label: "Overview", href: "/control-plane" },
              { label: "Agents", href: "/agents" },
              { label: "Events", href: "/events" },
              { label: "Topology", href: "/topology" },
              { label: "Incidents", href: "/incidents" },
              { label: "Thresholds", href: "/thresholds" },
              { label: "Executions", href: "/executions" },
            ].map((item) => (
              <Command.Item
                key={item.href}
                value={`go ${item.label}`}
                onSelect={() => runAndClose(() => router.push(item.href))}
                className="px-3 py-2 rounded text-sm cursor-pointer aria-selected:bg-muted"
              >
                Go to {item.label}
              </Command.Item>
            ))}
          </Command.Group>

          {/* Agents */}
          {agents.length > 0 && (
            <Command.Group
              heading="Agents"
              className="px-2 py-1.5 text-xs text-muted-foreground"
            >
              {agents.map((agent) => (
                <Command.Item
                  key={agent.id}
                  value={`agent ${agent.id} ${agent.status}`}
                  onSelect={() =>
                    runAndClose(() => {
                      setAgentId(agent.id)
                      router.push(`/agents/${agent.id}`)
                    })
                  }
                  className="px-3 py-2 rounded text-sm cursor-pointer aria-selected:bg-muted flex justify-between"
                >
                  <span>{agent.id}</span>
                  <span className="text-xs text-muted-foreground">
                    {agent.status} &middot; trust {agent.trustScore.toFixed(3)}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Recent events */}
          {recentEvents.length > 0 && (
            <Command.Group
              heading="Recent Events"
              className="px-2 py-1.5 text-xs text-muted-foreground"
            >
              {recentEvents.slice(0, 8).map((evt) => (
                <Command.Item
                  key={evt.id}
                  value={`event ${evt.type} ${evt.message} ${evt.agentId ?? ""}`}
                  onSelect={() =>
                    runAndClose(() => {
                      if (evt.agentId) setAgentId(evt.agentId)
                      router.push("/events")
                    })
                  }
                  className="px-3 py-2 rounded text-sm cursor-pointer aria-selected:bg-muted"
                >
                  <span className="text-xs text-muted-foreground mr-2">[{evt.type}]</span>
                  {evt.message.slice(0, 60)}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Quick actions */}
          <Command.Group
            heading="Actions"
            className="px-2 py-1.5 text-xs text-muted-foreground"
          >
            {/* Source connections */}
            {Object.values(dataSources).map((ds) => (
              <Command.Item
                key={ds.key}
                value={`connect ${ds.label} ${ds.key}`}
                onSelect={() =>
                  runAndClose(() => connect(ds.key as DataSourceKey))
                }
                className="px-3 py-2 rounded text-sm cursor-pointer aria-selected:bg-muted"
              >
                Connect: {ds.label}
              </Command.Item>
            ))}

            {connected && (
              <Command.Item
                value="disconnect source"
                onSelect={() => runAndClose(disconnect)}
                className="px-3 py-2 rounded text-sm cursor-pointer aria-selected:bg-muted"
              >
                Disconnect current source
              </Command.Item>
            )}

            {/* Theme */}
            <Command.Item
              value="theme light mode"
              onSelect={() => runAndClose(() => setTheme("light"))}
              className="px-3 py-2 rounded text-sm cursor-pointer aria-selected:bg-muted"
            >
              Switch to Light Mode
            </Command.Item>
            <Command.Item
              value="theme dark mode"
              onSelect={() => runAndClose(() => setTheme("dark"))}
              className="px-3 py-2 rounded text-sm cursor-pointer aria-selected:bg-muted"
            >
              Switch to Dark Mode
            </Command.Item>
            <Command.Item
              value="theme system mode"
              onSelect={() => runAndClose(() => setTheme("system"))}
              className="px-3 py-2 rounded text-sm cursor-pointer aria-selected:bg-muted"
            >
              Switch to System Theme
            </Command.Item>
          </Command.Group>
        </Command.List>

        <div className="border-t px-4 py-2 text-xs text-muted-foreground flex justify-between">
          <span>
            <kbd className="px-1 py-0.5 rounded border text-[10px]">↑↓</kbd> navigate
            <span className="mx-2">&middot;</span>
            <kbd className="px-1 py-0.5 rounded border text-[10px]">↵</kbd> select
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded border text-[10px]">esc</kbd> close
          </span>
        </div>
      </div>
    </Command.Dialog>
  )
}
