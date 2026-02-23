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
const MAX_STABILITY_POINTS = 100
let currentUnsubscribe: Unsubscribe | null = null
let connectionEpoch = 0
let seenStabilityCycleIds: string[] = []

interface GovernanceEventFilters {
  severity?: GovernanceEvent["severity"] | "all"
  agentId?: string | "all"
  type?: GovernanceEvent["type"] | "all"
  windowMs?: number
}

function eventDedupKey(event: GovernanceEvent): string {
  return `${event.id}|${event.timestamp}|${event.type}|${event.agentId ?? ""}`
}

function mergeEventsBounded(existing: GovernanceEvent[], incoming: GovernanceEvent[]): GovernanceEvent[] {
  if (incoming.length === 0) return existing
  const seen = new Set(existing.map(eventDedupKey))
  const merged = [...existing]
  for (const event of incoming) {
    const key = eventDedupKey(event)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(event)
  }
  return merged.length > MAX_EVENTS ? merged.slice(merged.length - MAX_EVENTS) : merged
}

function isStreamOnlySnapshot(snapshot: GovernanceSnapshot): boolean {
  return snapshot.source === "live_events_stream"
}

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

function clearStabilityCycleCache() {
  seenStabilityCycleIds = []
}

function rememberCycleId(cycleId: string): boolean {
  if (!cycleId) return false
  if (seenStabilityCycleIds.includes(cycleId)) return false
  seenStabilityCycleIds.push(cycleId)
  if (seenStabilityCycleIds.length > MAX_STABILITY_POINTS * 3) {
    seenStabilityCycleIds = seenStabilityCycleIds.slice(
      seenStabilityCycleIds.length - MAX_STABILITY_POINTS * 3,
    )
  }
  return true
}

function appendStabilityPoint(
  points: { ts: string; value: number }[],
  point: { ts: string; value: number },
): { ts: string; value: number }[] {
  const next = [...points, point]
  return next.length > MAX_STABILITY_POINTS
    ? next.slice(next.length - MAX_STABILITY_POINTS)
    : next
}

function getCycleIdFromEvent(event: GovernanceEvent): string | null {
  const metadata = event.metadata ?? {}
  const cycleId = metadata.cycleId
  return typeof cycleId === "string" && cycleId.length > 0 ? cycleId : null
}

function computeStabilityFromTrustEvents(events: GovernanceEvent[]): { ts: string; value: number }[] {
  const grouped = new Map<string, { ts: string; value: number }>()
  for (const event of events) {
    if (event.type !== "trust_update") continue
    const cycleId = getCycleIdFromEvent(event)
    if (!cycleId || !rememberCycleId(cycleId)) continue
    const metadata = event.metadata ?? {}
    const trustAfter = metadata.trustAfter
    const authorityAfter = metadata.authorityAfter
    if (typeof trustAfter !== "number" || typeof authorityAfter !== "number") continue
    const prev = grouped.get(cycleId)
    const nextValue = (prev?.value ?? 0) + trustAfter * authorityAfter
    grouped.set(cycleId, {
      ts: event.timestamp,
      value: nextValue,
    })
  }
  return Array.from(grouped.values()).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
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
    clearStabilityCycleCache()
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
            const cappedEvents = mergeEventsBounded(state.events, payload.events)
            const canUpdateSnapshot =
              !isStreamOnlySnapshot(payload.snapshot) || state.snapshot === null

            const nextSnapshot = canUpdateSnapshot ? payload.snapshot : state.snapshot

            let newHistory = state.stabilityHistory
            if (canUpdateSnapshot && nextSnapshot && nextSnapshot.agents.length > 0) {
              const stability = nextSnapshot.agents.reduce(
                (acc, a) => acc + a.trustScore * a.authorityWeight,
                0,
              )
              newHistory = appendStabilityPoint(newHistory, {
                ts: nextSnapshot.timestamp,
                value: stability,
              })
            } else if (isStreamOnlySnapshot(payload.snapshot) && payload.events.length > 0) {
              const derivedPoints = computeStabilityFromTrustEvents(payload.events)
              for (const point of derivedPoints) {
                newHistory = appendStabilityPoint(newHistory, point)
              }
            }

            return {
              ...state,
              snapshot: nextSnapshot,
              events: cappedEvents,
              history:
                canUpdateSnapshot && nextSnapshot
                  ? [...state.history, nextSnapshot].slice(-MAX_STABILITY_POINTS)
                  : state.history,
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
    clearStabilityCycleCache()
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
    clearStabilityCycleCache()
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

export function selectFilteredEvents(filters: GovernanceEventFilters): GovernanceEvent[] {
  const state = useGovernanceStore.getState()
  const now = Date.now()
  const severity = filters.severity ?? "all"
  const agentId = filters.agentId ?? "all"
  const type = filters.type ?? "all"
  const windowMs = filters.windowMs ?? 0

  return state.events.filter((event) => {
    if (severity !== "all" && event.severity !== severity) return false
    if (agentId !== "all" && event.agentId !== agentId) return false
    if (type !== "all" && event.type !== type) return false
    if (windowMs > 0) {
      const ts = Date.parse(event.timestamp)
      if (!Number.isFinite(ts)) return false
      if (ts < now - windowMs) return false
    }
    return true
  })
}
