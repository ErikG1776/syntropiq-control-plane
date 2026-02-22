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
  connect: (sourceKey: DataSourceKey) => Promise<void>
  disconnect: () => void
  reset: () => void
}

const MAX_EVENTS = 1000
let currentUnsubscribe: Unsubscribe | null = null
let connectionEpoch = 0

function clearActiveSubscription() {
  if (currentUnsubscribe) {
    try {
      currentUnsubscribe()
    } catch {
      // no-op: datasource unsubscriber must never crash app teardown.
    }
    currentUnsubscribe = null
  }
}

export const useGovernanceStore = create<GovernanceState>((set) => ({
  connected: false,
  source: null,
  lastMessageAt: null,
  snapshot: null,
  history: [],
  stabilityHistory: [],
  events: [],
  error: null,
  connecting: false,

  connect: async (sourceKey) => {
    connectionEpoch += 1
    const requestEpoch = connectionEpoch

    clearActiveSubscription()
    set({
      connected: false,
      connecting: true,
      source: sourceKey,
      error: null,
      lastMessageAt: null,
      snapshot: null,
      stabilityHistory: [],
      events: [],
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
          set((state) => {
            const mergedEvents = [...state.events, ...payload.events]
            const cappedEvents =
              mergedEvents.length > MAX_EVENTS
                ? mergedEvents.slice(mergedEvents.length - MAX_EVENTS)
                : mergedEvents
            const stability =
              payload.snapshot.agents.length > 0
                ? payload.snapshot.agents.reduce(
                    (acc, a) => acc + a.trustScore * a.authorityWeight,
                    0
                  )
                : 0
            const newHistory = [
              ...state.stabilityHistory,
              { ts: payload.snapshot.timestamp, value: stability },
            ].slice(-300)
            return {
              ...state,
              snapshot: payload.snapshot,
              events: cappedEvents,
              history: [...state.history, payload.snapshot].slice(-300),
              stabilityHistory: newHistory,
              connected: true,
              connecting: false,
              error: null,
              lastMessageAt: new Date().toISOString(),
            }
          })
        },
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
    })
  },
}))

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
    .map((snap) =>
      snap.agents.find((a) => a.id === agentId)?.trustScore ?? null
    )
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
