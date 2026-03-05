"use client"

import { create } from "zustand"
import type {
  DataSourceKey,
  GovernanceEvent,
  GovernanceSnapshot,
  GovernanceStreamPayload,
  Unsubscribe,
} from "@/lib/governance/schema"
import { dataSources } from "@/lib/datasources"
import { validatePayload } from "@/lib/datasources/normalize"
import type { ValidationWarning } from "@/lib/datasources/normalize"

// ---------------------------------------------------------------------------
// Session persistence helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY_SOURCE = "syntropiq_last_source"

function persistSource(key: DataSourceKey | null) {
  try {
    if (key) localStorage.setItem(STORAGE_KEY_SOURCE, key)
    else localStorage.removeItem(STORAGE_KEY_SOURCE)
  } catch { /* SSR or private browsing — ignore */ }
}

function loadPersistedSource(): DataSourceKey | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SOURCE)
    if (stored && stored in dataSources) return stored as DataSourceKey
  } catch { /* SSR */ }
  return null
}

// ---------------------------------------------------------------------------
// Event deduplication
// ---------------------------------------------------------------------------

const MAX_SEEN_IDS = 2000
let seenEventIds = new Set<string>()

function deduplicateEvents(
  existing: GovernanceEvent[],
  incoming: GovernanceEvent[],
): GovernanceEvent[] {
  const newEvents: GovernanceEvent[] = []
  for (const evt of incoming) {
    if (!seenEventIds.has(evt.id)) {
      seenEventIds.add(evt.id)
      newEvents.push(evt)
    }
  }
  if (seenEventIds.size > MAX_SEEN_IDS) {
    const arr = Array.from(seenEventIds)
    seenEventIds = new Set(arr.slice(arr.length - MAX_SEEN_IDS / 2))
  }
  return [...existing, ...newEvents]
}

// ---------------------------------------------------------------------------
// Backpressure: RAF-gated store updates
// ---------------------------------------------------------------------------

let pendingPayload: GovernanceStreamPayload | null = null
let rafScheduled = false
let flushToStore: ((payload: GovernanceStreamPayload) => void) | null = null

let _messagesReceived = 0
let _messagesDropped = 0

function scheduleStoreUpdate(payload: GovernanceStreamPayload) {
  _messagesReceived += 1
  // If a frame is already pending, drop the older one (keep latest)
  if (pendingPayload) _messagesDropped += 1
  pendingPayload = payload

  if (!rafScheduled && typeof requestAnimationFrame !== "undefined") {
    rafScheduled = true
    requestAnimationFrame(() => {
      rafScheduled = false
      if (pendingPayload && flushToStore) {
        const p = pendingPayload
        pendingPayload = null
        flushToStore(p)
      }
    })
  } else if (!rafScheduled) {
    // SSR / test fallback — flush immediately
    if (pendingPayload && flushToStore) {
      const p = pendingPayload
      pendingPayload = null
      flushToStore(p)
    }
  }
}

// ---------------------------------------------------------------------------
// Connection health metrics
// ---------------------------------------------------------------------------

export interface ConnectionHealth {
  messagesReceived: number
  messagesDropped: number
  validationWarnings: number
  lastMessageAt: string | null
  latencyMs: number | null
  connectedSince: string | null
  uptimeMs: number
}

let _connectedSince: string | null = null
let _totalValidationWarnings = 0

export function getConnectionHealth(): ConnectionHealth {
  const state = useGovernanceStore.getState()
  const now = Date.now()
  const lastMsg = state.lastMessageAt
  const latencyMs =
    lastMsg && !Number.isNaN(Date.parse(lastMsg))
      ? Math.max(0, now - Date.parse(lastMsg))
      : null
  const uptimeMs =
    _connectedSince && !Number.isNaN(Date.parse(_connectedSince))
      ? Math.max(0, now - Date.parse(_connectedSince))
      : 0

  return {
    messagesReceived: _messagesReceived,
    messagesDropped: _messagesDropped,
    validationWarnings: _totalValidationWarnings,
    lastMessageAt: lastMsg,
    latencyMs,
    connectedSince: _connectedSince,
    uptimeMs,
  }
}

function resetHealthMetrics() {
  _messagesReceived = 0
  _messagesDropped = 0
  _totalValidationWarnings = 0
  _connectedSince = null
  pendingPayload = null
  rafScheduled = false
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface GovernanceState {
  connected: boolean
  source: DataSourceKey | null
  lastMessageAt: string | null
  snapshot: GovernanceSnapshot | null
  history: GovernanceSnapshot[]
  stabilityHistory: { ts: string; value: number }[]
  events: GovernanceEvent[]
  error: string | null
  connecting: boolean
  lastValidationWarnings: ValidationWarning[]
  connect: (sourceKey: DataSourceKey) => Promise<void>
  disconnect: () => void
  reset: () => void
}

const MAX_EVENTS = 1000
let currentUnsubscribe: Unsubscribe | null = null
let connectionEpoch = 0

function clearActiveSubscription() {
  if (currentUnsubscribe) {
    try { currentUnsubscribe() } catch { /* no-op */ }
    currentUnsubscribe = null
  }
}

function applyPayload(
  state: GovernanceState,
  payload: GovernanceStreamPayload,
): Partial<GovernanceState> {
  const warnings = validatePayload(payload)
  if (warnings.length > 0) _totalValidationWarnings += warnings.length
  const newHistory = [...state.history, payload.snapshot].slice(-200)

  return {
    snapshot: payload.snapshot,
    events: [...state.events, ...payload.events],
    history: newHistory,
    stabilityHistory: [
      ...state.stabilityHistory,
      {
        ts: new Date(payload.snapshot.timestamp).getTime(),
        value:
          payload.snapshot.agents.reduce(
            (sum, a) => sum + a.trustScore * a.authorityWeight,
            0,
          ) /
          payload.snapshot.agents.reduce(
            (sum, a) => sum + a.authorityWeight,
            0,
          ),
      },
    ].slice(-200),
    connected: true,
    connecting: false,
    error: null,
    lastMessageAt: new Date().toISOString(),
    lastValidationWarnings: warnings,
  }
}

export const useGovernanceStore = create<GovernanceState>((set) => {
  // Wire up the RAF flush callback
  flushToStore = (payload: GovernanceStreamPayload) => {
    set((state) => ({ ...state, ...applyPayload(state, payload) }))
  }

  return {
    connected: false,
    source: null,
    lastMessageAt: null,
    snapshot: null,
    history: [],
    stabilityHistory: [],
    events: [],
    error: null,
    connecting: false,
    lastValidationWarnings: [],

    connect: async (sourceKey) => {
      connectionEpoch += 1
      const requestEpoch = connectionEpoch

      clearActiveSubscription()
      seenEventIds.clear()
      resetHealthMetrics()
      persistSource(sourceKey)
      set({
        connected: false,
        connecting: true,
        source: sourceKey,
        error: null,
        lastMessageAt: null,
        snapshot: null,
        stabilityHistory: [],
        events: [],
        lastValidationWarnings: [],
      })

      const source = dataSources[sourceKey]
      if (!source) {
        set({
          connecting: false,
          connected: false,
          error: `Datasource "${sourceKey}" is not configured.`,
        })
        return
      }

      try {
        const unsubscribe = await source.connect({
          onStatus: (status) => {
            if (requestEpoch !== connectionEpoch) return
            if (status.connected && !_connectedSince) {
              _connectedSince = new Date().toISOString()
            }
            set((state) => ({
              ...state,
              connected: status.connected,
              connecting: false,
              error:
                !status.connected && status.message
                  ? status.message
                  : state.error,
            }))
          },
          onMessage: (payload: GovernanceStreamPayload) => {
            if (requestEpoch !== connectionEpoch) return
            scheduleStoreUpdate(payload)
          },
          config: source.config,
        })

        if (requestEpoch !== connectionEpoch) {
          unsubscribe()
          return
        }
        currentUnsubscribe = unsubscribe
      } catch (err) {
        set({
          connecting: false,
          connected: false,
          error: err instanceof Error ? err.message : "Failed to connect datasource.",
        })
      }
    },

    disconnect: () => {
      connectionEpoch += 1
      clearActiveSubscription()
      resetHealthMetrics()
      persistSource(null)
      set((state) => ({
        ...state,
        connecting: false,
        connected: false,
        source: null,
        lastMessageAt: null,
      }))
    },

    reset: () => {
      connectionEpoch += 1
      clearActiveSubscription()
      seenEventIds.clear()
      resetHealthMetrics()
      persistSource(null)
      set({
        connected: false,
        source: null,
        lastMessageAt: null,
        snapshot: null,
        history: [],
        stabilityHistory: [],
        events: [],
        error: null,
        connecting: false,
        lastValidationWarnings: [],
      })
    },
  }
})

// ---------------------------------------------------------------------------
// Auto-reconnect on mount
// ---------------------------------------------------------------------------

if (typeof window !== "undefined") {
  const stored = loadPersistedSource()
  if (stored) {
    setTimeout(() => {
      const state = useGovernanceStore.getState()
      if (!state.connected && !state.connecting) {
        state.connect(stored)
      }
    }, 0)
  }
}

// ---------------------------------------------------------------------------
// Derived selectors (static helpers — call outside React render)
// ---------------------------------------------------------------------------

export function getAgentCount() {
  return useGovernanceStore.getState().snapshot?.agents.length ?? 0
}

export function getSuppressedCount() {
  return useGovernanceStore.getState().snapshot?.suppressedCount ?? 0
}

export function getMutationCount() {
  return useGovernanceStore
    .getState()
    .events.filter((event) => event.type === "mutation").length
}

export function getEventsCount() {
  return useGovernanceStore.getState().events.length
}

export function getStreamLatencyMs(nowMs = Date.now()) {
  const lastMessageAt = useGovernanceStore.getState().lastMessageAt
  if (!lastMessageAt) return null
  const parsed = Date.parse(lastMessageAt)
  if (Number.isNaN(parsed)) return null
  return Math.max(0, nowMs - parsed)
}

export function getEventsPerMinute(nowMs = Date.now()) {
  const oneMinuteAgo = nowMs - 60_000
  return useGovernanceStore
    .getState()
    .events.filter((event) => {
      const ts = Date.parse(event.timestamp)
      return Number.isFinite(ts) && ts >= oneMinuteAgo
    }).length
}

// ---- Derived Regime Intelligence ----

export function getTrustTrend(agentId: string): "up" | "down" | "flat" | "unknown" {
  const { history } = useGovernanceStore.getState()
  if (history.length < 3) return "unknown"

  const lastThree = history.slice(-3)
  const values = lastThree
    .map((snap) => snap.agents.find((a) => a.id === agentId)?.trustScore ?? null)
    .filter((v): v is number => typeof v === "number")

  if (values.length < 3) return "unknown"
  const delta = values[2] - values[0]
  if (delta > 0.01) return "up"
  if (delta < -0.01) return "down"
  return "flat"
}

export function getRecentSuppressionTransitions(): string[] {
  const { history } = useGovernanceStore.getState()
  if (history.length < 2) return []

  const prev = history[history.length - 2]
  const curr = history[history.length - 1]
  const transitions: string[] = []

  for (const agent of curr.agents) {
    const prevState = prev.agents.find((a) => a.id === agent.id)?.status
    if (prevState !== "suppressed" && agent.status === "suppressed") {
      transitions.push(agent.id)
    }
  }
  return transitions
}
