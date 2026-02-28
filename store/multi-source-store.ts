"use client"

import { create } from "zustand"
import type {
  DataSourceKey,
  GovernanceStreamPayload,
  Unsubscribe,
} from "@/lib/governance/schema"
import { dataSources } from "@/lib/datasources"
import { createComponentLogger } from "@/lib/logger"
import type { SourceState, CompositionStrategy } from "@/lib/datasources/composition"
import { composeSnapshot } from "@/lib/datasources/composition"
import { useGovernanceStore } from "@/store/governance-store"

const msLogger = createComponentLogger("multi-source")

// ---------------------------------------------------------------------------
// Per-source subscriptions
// ---------------------------------------------------------------------------

const sourceSubscriptions = new Map<DataSourceKey, Unsubscribe>()

// ---------------------------------------------------------------------------
// Multi-source store
// ---------------------------------------------------------------------------

interface MultiSourceState {
  /** Active source connections. */
  sources: Record<string, SourceState>
  /** Whether multi-source mode is enabled. */
  enabled: boolean
  /** How to merge data from multiple sources. */
  strategy: CompositionStrategy
  /** Add and connect a source. */
  addSource: (key: DataSourceKey) => Promise<void>
  /** Disconnect and remove a source. */
  removeSource: (key: DataSourceKey) => void
  /** Enable/disable multi-source composition. */
  setEnabled: (enabled: boolean) => void
  /** Set the composition strategy. */
  setStrategy: (strategy: CompositionStrategy) => void
  /** Get the list of active source keys. */
  getActiveSourceKeys: () => DataSourceKey[]
}

function recompose(sources: Record<string, SourceState>, strategy: CompositionStrategy) {
  const activeSources = Object.values(sources).filter((s) => s.lastPayload)
  if (activeSources.length === 0) return

  const composed = composeSnapshot(activeSources, strategy)

  // Push composed data into the main governance store
  const govStore = useGovernanceStore.getState()
  // Directly apply — this merges into the main store's state
  useGovernanceStore.setState((state) => {
    const mergedEvents = composed.events
    const totalWeight = composed.snapshot.agents.reduce(
      (acc, a) => acc + a.authorityWeight, 0,
    )
    const stability =
      totalWeight > 0
        ? composed.snapshot.agents.reduce(
            (acc, a) => acc + a.trustScore * a.authorityWeight, 0,
          ) / totalWeight
        : 0

    return {
      ...state,
      snapshot: composed.snapshot,
      events: mergedEvents,
      history: [...state.history, composed.snapshot].slice(-300),
      stabilityHistory: [
        ...state.stabilityHistory,
        { ts: composed.snapshot.timestamp, value: stability },
      ].slice(-300),
      connected: Object.values(sources).some((s) => s.connected),
      connecting: false,
      lastMessageAt: new Date().toISOString(),
    }
  })
}

export const useMultiSourceStore = create<MultiSourceState>((set, get) => ({
  sources: {},
  enabled: false,
  strategy: "conservative",

  addSource: async (key) => {
    const source = dataSources[key]
    if (!source) {
      msLogger.error("Datasource not found", { key })
      return
    }

    // If already connected, skip
    if (sourceSubscriptions.has(key)) {
      msLogger.warn("Source already connected", { key })
      return
    }

    msLogger.info("Adding source", { key, mode: source.mode })

    // Initialize source state
    set((state) => ({
      sources: {
        ...state.sources,
        [key]: {
          key,
          connected: false,
          lastPayload: null,
          lastMessageAt: null,
          error: null,
        },
      },
    }))

    try {
      const unsubscribe = await source.connect({
        onStatus: (status) => {
          set((state) => ({
            sources: {
              ...state.sources,
              [key]: {
                ...state.sources[key],
                connected: status.connected,
                error: !status.connected ? (status.message ?? null) : null,
              },
            },
          }))
        },
        onMessage: (payload: GovernanceStreamPayload) => {
          set((state) => {
            const updated = {
              sources: {
                ...state.sources,
                [key]: {
                  ...state.sources[key],
                  lastPayload: payload,
                  lastMessageAt: new Date().toISOString(),
                  connected: true,
                },
              },
            }

            // Trigger recomposition
            if (state.enabled) {
              setTimeout(() => recompose(get().sources, get().strategy), 0)
            }

            return updated
          })
        },
        config: source.config,
      })

      sourceSubscriptions.set(key, unsubscribe)
    } catch (err) {
      msLogger.error("Failed to connect source", {
        key,
        error: err instanceof Error ? err.message : String(err),
      })
      set((state) => ({
        sources: {
          ...state.sources,
          [key]: {
            ...state.sources[key],
            connected: false,
            error: err instanceof Error ? err.message : "Connection failed",
          },
        },
      }))
    }
  },

  removeSource: (key) => {
    const unsub = sourceSubscriptions.get(key)
    if (unsub) {
      try { unsub() } catch { /* no-op */ }
      sourceSubscriptions.delete(key)
    }

    set((state) => {
      const { [key]: _, ...rest } = state.sources
      return { sources: rest }
    })

    msLogger.info("Removed source", { key })

    // Recompose without this source
    const { sources, strategy, enabled } = get()
    if (enabled) {
      recompose(sources, strategy)
    }
  },

  setEnabled: (enabled) => {
    set({ enabled })
    msLogger.info("Multi-source mode", { enabled })
  },

  setStrategy: (strategy) => {
    set({ strategy })
    // Re-compose with new strategy
    const { sources, enabled } = get()
    if (enabled) {
      recompose(sources, strategy)
    }
  },

  getActiveSourceKeys: () => {
    return Object.keys(get().sources) as DataSourceKey[]
  },
}))
