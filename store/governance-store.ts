"use client"

import { create } from "zustand"
import type {
  GovernanceThresholds,
  DataSourceKey,
  GovernanceEvent,
  GovernanceSnapshot,
  GovernanceStreamPayload,
  Unsubscribe,
} from "@/lib/governance/schema"
import { dataSources } from "@/lib/datasources"
import type { DataSourceConfig } from "@/lib/datasources/types"
import type { ValidationWarning } from "@/lib/datasources/normalize"
import {
  parseCustomSourceKey,
  useCustomDataSourceStore,
} from "@/store/custom-datasource-store"

// ---------------------------------------------------------------------------
// Session persistence helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY_SOURCE = "syntropiq_last_source"
const STORAGE_KEY_ACTIVE_SOURCES = "syntropiq_active_sources"
const STORAGE_KEY_MULTI_MODE = "syntropiq_multi_source_mode"

function persistSource(key: string | null) {
  try {
    if (key) localStorage.setItem(STORAGE_KEY_SOURCE, key)
    else localStorage.removeItem(STORAGE_KEY_SOURCE)
  } catch { /* SSR or private browsing — ignore */ }
}

function loadPersistedSource(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SOURCE)
    if (stored) return stored
  } catch { /* SSR */ }
  return null
}

function persistActiveSources(keys: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_SOURCES, JSON.stringify(keys))
  } catch { /* SSR */ }
}

function loadPersistedActiveSources(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_SOURCES)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []
  } catch {
    return []
  }
}

function persistMultiSourceMode(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY_MULTI_MODE, enabled ? "1" : "0")
  } catch { /* SSR */ }
}

function loadPersistedMultiSourceMode(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_MULTI_MODE) === "1"
  } catch {
    return false
  }
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

function dedupeByEventId(events: GovernanceEvent[]): GovernanceEvent[] {
  const seen = new Set<string>()
  const out: GovernanceEvent[] = []
  for (const evt of events) {
    if (seen.has(evt.id)) continue
    seen.add(evt.id)
    out.push(evt)
  }
  return out
}

// ---------------------------------------------------------------------------
// Backpressure: RAF-gated store updates
// ---------------------------------------------------------------------------

let pendingBySource: Record<string, GovernanceStreamPayload> = {}
let rafScheduled = false
let flushToStore: ((updates: Record<string, GovernanceStreamPayload>) => void) | null = null

let _messagesReceived = 0
let _messagesDropped = 0

function scheduleStoreUpdate(sourceKey: string, payload: GovernanceStreamPayload) {
  _messagesReceived += 1
  if (pendingBySource[sourceKey]) _messagesDropped += 1
  pendingBySource[sourceKey] = payload

  if (!rafScheduled && typeof requestAnimationFrame !== "undefined") {
    rafScheduled = true
    requestAnimationFrame(() => {
      rafScheduled = false
      if (flushToStore && Object.keys(pendingBySource).length > 0) {
        const updates = pendingBySource
        pendingBySource = {}
        flushToStore(updates)
      }
    })
  } else if (!rafScheduled) {
    if (flushToStore && Object.keys(pendingBySource).length > 0) {
      const updates = pendingBySource
      pendingBySource = {}
      flushToStore(updates)
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
  pendingBySource = {}
  rafScheduled = false
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SourceConnectionState {
  connected: boolean
  connecting: boolean
  error: string | null
  lastMessageAt: string | null
}

interface GovernanceState {
  connected: boolean
  source: string | null
  activeSources: string[]
  multiSourceMode: boolean
  connections: Record<string, SourceConnectionState>
  snapshotsBySource: Record<string, GovernanceSnapshot>
  eventsBySource: Record<string, GovernanceEvent[]>
  historyBySource: Record<string, GovernanceSnapshot[]>
  stabilityBySource: Record<string, number>
  lastMessageAt: string | null
  snapshot: GovernanceSnapshot | null
  history: GovernanceSnapshot[]
  stabilityHistory: { ts: string; value: number }[]
  events: GovernanceEvent[]
  error: string | null
  connecting: boolean
  lastValidationWarnings: ValidationWarning[]
  mutateThresholds: (
    updated: GovernanceThresholds,
  ) => { ok: true } | { ok: false; error: string }
  connectSource: (sourceKey: string) => Promise<void>
  disconnectSource: (sourceKey: string) => void
  setActiveSources: (keys: string[]) => void
  setMultiSourceMode: (enabled: boolean) => void
  connect: (sourceKey: string) => Promise<void>
  disconnect: () => void
  reset: () => void
}

const MAX_EVENTS = 1000
const MAX_HISTORY = 300
let currentUnsubscribes: Record<string, Unsubscribe> = {}
let sourceEpochs: Record<string, number> = {}

function clearSubscriptionForSource(sourceKey: string) {
  const unsubscribe = currentUnsubscribes[sourceKey]
  if (unsubscribe) {
    try { unsubscribe() } catch { /* no-op */ }
    delete currentUnsubscribes[sourceKey]
  }
}

function clearAllSubscriptions() {
  for (const key of Object.keys(currentUnsubscribes)) {
    clearSubscriptionForSource(key)
  }
}

function computeStability(snapshot: GovernanceSnapshot): number {
  const totalWeight = snapshot.agents.reduce((acc, a) => acc + a.authorityWeight, 0)
  if (totalWeight <= 0) return 0
  return snapshot.agents.reduce((acc, a) => acc + a.trustScore * a.authorityWeight, 0) / totalWeight
}

function appendAuthQuery(url: string, type: "bearer" | "apikey", token: string): string {
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    const parsed = new URL(url, base)
    parsed.searchParams.set(type === "bearer" ? "bearer" : "apikey", token)
    const asString = parsed.toString()
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("ws://") || url.startsWith("wss://")) {
      return asString
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    const sep = url.includes("?") ? "&" : "?"
    const key = type === "bearer" ? "bearer" : "apikey"
    return `${url}${sep}${key}=${encodeURIComponent(token)}`
  }
}

function getSourceConnector(sourceKey: string): {
  source: typeof dataSources[keyof typeof dataSources]
  config: DataSourceConfig | undefined
} | null {
  const builtinSource =
    sourceKey in dataSources ? dataSources[sourceKey as DataSourceKey] : undefined
  if (builtinSource) return { source: builtinSource, config: builtinSource.config }

  const customId = parseCustomSourceKey(sourceKey)
  if (!customId) return null

  const custom = useCustomDataSourceStore
    .getState()
    .customDataSources.find((ds) => ds.id === customId)
  if (!custom) return null

  const protocolSourceKey =
    custom.protocol === "poll"
      ? "live_api"
      : custom.protocol === "sse"
        ? "live_sse"
        : custom.protocol === "ws"
          ? "live_ws"
          : "live_grpc"
  const baseSource = dataSources[protocolSourceKey]
  const config: DataSourceConfig = { ...(baseSource.config ?? {}), url: custom.url }

  if (custom.protocol === "poll") {
    config.pollIntervalMs = custom.pollIntervalMs ?? baseSource.config?.pollIntervalMs ?? 2000
  }

  if (custom.authType !== "none" && custom.authValue && custom.protocol !== "grpc") {
    if (custom.protocol === "poll") {
      config.auth = {
        type: custom.authType,
        token: custom.authValue,
      }
    } else {
      config.url = appendAuthQuery(custom.url, custom.authType, custom.authValue)
    }
  }

  return { source: baseSource, config }
}

function toComposedEvent(evt: GovernanceEvent, sourceKey: string): GovernanceEvent {
  return {
    ...evt,
    metadata: {
      ...(evt.metadata ?? {}),
      sourceKey,
    },
  }
}

function getComposedData(state: Pick<GovernanceState,
  "activeSources" |
  "snapshotsBySource" |
  "eventsBySource" |
  "historyBySource" |
  "connections"
>) {
  const active = state.activeSources.length > 0
    ? state.activeSources
    : Object.keys(state.snapshotsBySource)

  const available = active.filter((key) => state.snapshotsBySource[key])
  if (available.length === 0) {
    return {
      snapshot: null as GovernanceSnapshot | null,
      events: [] as GovernanceEvent[],
      history: [] as GovernanceSnapshot[],
      stability: 0,
      stabilityBySource: {} as Record<string, number>,
      connected: false,
      connecting: Object.values(state.connections).some((c) => c.connecting),
      error: Object.values(state.connections).find((c) => c.error)?.error ?? null,
      lastMessageAt: Object.values(state.connections)
        .map((c) => c.lastMessageAt)
        .filter((v): v is string => Boolean(v))
        .sort()
        .at(-1) ?? null,
    }
  }

  const singleSource = available.length === 1
  const sourceSnapshots = available.map((key) => ({ key, snapshot: state.snapshotsBySource[key] }))
  const latest = sourceSnapshots
    .slice()
    .sort((a, b) => Date.parse(a.snapshot.timestamp) - Date.parse(b.snapshot.timestamp))
    .at(-1)!

  let composedAgents = latest.snapshot.agents
  if (!singleSource) {
    composedAgents = sourceSnapshots.flatMap(({ key, snapshot }) =>
      snapshot.agents.map((agent) => ({
        ...agent,
        id: `${key}::${agent.id}`,
        source: key,
        labels: {
          ...(agent.labels ?? {}),
          sourceKey: key,
          source: key,
        },
      } as any)),
    )
  }

  const composedEvents = dedupeByEventId(
    available
      .flatMap((key) => (state.eventsBySource[key] ?? []).map((evt) => toComposedEvent(evt, key)))
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
  ).slice(-MAX_EVENTS)

  const composedHistory = available
    .flatMap((key) => state.historyBySource[key] ?? [])
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-MAX_HISTORY)

  const thresholds = singleSource
    ? latest.snapshot.thresholds
    : { trustThreshold: -1, suppressionThreshold: -1, driftDelta: -1 }

  const suppressedCount = composedAgents.filter((a) => a.status === "suppressed").length
  const snapshot: GovernanceSnapshot = {
    ...latest.snapshot,
    source: latest.snapshot.source,
    timestamp: latest.snapshot.timestamp,
    sequence: latest.snapshot.sequence,
    healthy: sourceSnapshots.every((s) => s.snapshot.healthy !== false),
    agents: composedAgents,
    thresholds,
    eventCount: composedEvents.length,
    suppressedCount,
  }

  const stabilityBySource = Object.fromEntries(
    sourceSnapshots.map(({ key, snapshot }) => [key, computeStability(snapshot)]),
  )
  const stability = computeStability(snapshot)

  return {
    snapshot,
    events: composedEvents,
    history: composedHistory,
    stability,
    stabilityBySource,
    connected: available.some((key) => state.connections[key]?.connected),
    connecting: available.some((key) => state.connections[key]?.connecting),
    error: available.map((key) => state.connections[key]?.error).find((v) => v) ?? null,
    lastMessageAt: available
      .map((key) => state.connections[key]?.lastMessageAt)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null,
  }
}

function applySourcePayloads(
  state: GovernanceState,
  updates: Record<string, GovernanceStreamPayload>,
): Partial<GovernanceState> {
  const nextSnapshotsBySource = { ...state.snapshotsBySource }
  const nextEventsBySource = { ...state.eventsBySource }
  const nextHistoryBySource = { ...state.historyBySource }
  const nextConnections = { ...state.connections }

  for (const [sourceKey, payload] of Object.entries(updates)) {
    nextSnapshotsBySource[sourceKey] = payload.snapshot
    nextEventsBySource[sourceKey] = payload.events ?? []
    nextHistoryBySource[sourceKey] = [
      ...(nextHistoryBySource[sourceKey] ?? []),
      payload.snapshot,
    ].slice(-MAX_HISTORY)

    nextConnections[sourceKey] = {
      connected: true,
      connecting: false,
      error: null,
      lastMessageAt: new Date().toISOString(),
    }
  }

  const activeKey =
    state.activeSources[0] ?? Object.keys(nextSnapshotsBySource)[0]

  const snapshot = activeKey
    ? nextSnapshotsBySource[activeKey] ?? null
    : null

  return {
    snapshotsBySource: nextSnapshotsBySource,
    eventsBySource: nextEventsBySource,
    historyBySource: nextHistoryBySource,
    connections: nextConnections,
    snapshot,
    events: activeKey ? nextEventsBySource[activeKey] ?? [] : [],
    history: activeKey ? nextHistoryBySource[activeKey] ?? [] : [],
    connected: true,
    connecting: false,
    error: null,
  }
}

export const useGovernanceStore = create<GovernanceState>((set) => {
  flushToStore = (updates) => {
    set((state) => ({
      ...state,
      ...applySourcePayloads(state, updates),
    }))
  }

  return {
    connected: false,
    source: null,
    activeSources: [],
    multiSourceMode: false,
    connections: {},
    snapshotsBySource: {},
    eventsBySource: {},
    historyBySource: {},
    stabilityBySource: {},
    lastMessageAt: null,
    snapshot: null,
    history: [],
    stabilityHistory: [],
    events: [],
    error: null,
    connecting: false,
    lastValidationWarnings: [],

    mutateThresholds: (updated) => {
      const state = useGovernanceStore.getState()
      const current = state.snapshot
      if (!current) return { ok: false, error: "No active snapshot to mutate." }

      const previous = current.thresholds
      if (updated.trustThreshold < 0.5 || updated.trustThreshold > 0.95) {
        return { ok: false, error: "Trust Threshold must stay between 0.50 and 0.95." }
      }

      const deltas = {
        trustThreshold: updated.trustThreshold - previous.trustThreshold,
        suppressionThreshold: updated.suppressionThreshold - previous.suppressionThreshold,
        driftDelta: updated.driftDelta - previous.driftDelta,
      }

      const maxDelta = Math.max(
        Math.abs(deltas.trustThreshold),
        Math.abs(deltas.suppressionThreshold),
        Math.abs(deltas.driftDelta),
      )
      if (maxDelta > 0.05) {
        return { ok: false, error: "Per-edit threshold delta cannot exceed 0.05." }
      }

      const cycleId = (current.sequence ?? state.history.length - 1) + 1
      const timestamp = new Date().toISOString()
      const decision = {
        action: "mutate_thresholds",
        previous,
        updated,
        delta: deltas,
        cycleId,
      }

      const event: GovernanceEvent = {
        id: `evt_manual_mutation_${cycleId}_${Date.now()}`,
        timestamp,
        type: "mutation",
        severity: "info",
        message: "Governance thresholds mutated via control plane",
        metadata: {
          decision,
          ...decision,
          cycleId: String(cycleId),
        },
      }

      const nextSnapshot: GovernanceSnapshot = {
        ...current,
        timestamp,
        sequence: cycleId,
        thresholds: updated,
        eventCount: 1,
      }

      const activeSource = state.source ?? state.activeSources[0] ?? "local"
      const payload: GovernanceStreamPayload = {
        snapshot: nextSnapshot,
        events: [event],
      }

      const partial = applySourcePayloads(state, { [activeSource]: payload })
      useGovernanceStore.setState({
        ...partial,
        source: activeSource,
        connected: true,
        connecting: false,
        error: null,
      })

      return { ok: true }
    },

    connectSource: async (sourceKey) => {
      const state = useGovernanceStore.getState()
      const uniqueActive = Array.from(new Set([...state.activeSources, sourceKey]))
      persistActiveSources(uniqueActive)

      sourceEpochs[sourceKey] = (sourceEpochs[sourceKey] ?? 0) + 1
      const requestEpoch = sourceEpochs[sourceKey]

      set((curr) => ({
        ...curr,
        source: sourceKey,
        activeSources: uniqueActive,
        connections: {
          ...curr.connections,
          [sourceKey]: {
            connected: false,
            connecting: true,
            error: null,
            lastMessageAt: curr.connections[sourceKey]?.lastMessageAt ?? null,
          },
        },
        connecting: true,
      }))

      const resolved = getSourceConnector(sourceKey)
      if (!resolved) {
        set((curr) => ({
          ...curr,
          connections: {
            ...curr.connections,
            [sourceKey]: {
              connected: false,
              connecting: false,
              error: `Datasource "${sourceKey}" is not configured.`,
              lastMessageAt: curr.connections[sourceKey]?.lastMessageAt ?? null,
            },
          },
          connecting: Object.values(curr.connections).some((c) => c.connecting),
          error: `Datasource "${sourceKey}" is not configured.`,
        }))
        return
      }

      try {
        const unsubscribe = await resolved.source.connect({
          onStatus: (status) => {
            if (requestEpoch !== sourceEpochs[sourceKey]) return
            if (status.connected && !_connectedSince) {
              _connectedSince = new Date().toISOString()
            }
            set((curr) => {
              const nextConnections = {
                ...curr.connections,
                [sourceKey]: {
                  connected: status.connected,
                  connecting: false,
                  error: !status.connected && status.message ? status.message : null,
                  lastMessageAt: curr.connections[sourceKey]?.lastMessageAt ?? null,
                },
              }
              const composed = getComposedData({
                activeSources: curr.activeSources,
                snapshotsBySource: curr.snapshotsBySource,
                eventsBySource: curr.eventsBySource,
                historyBySource: curr.historyBySource,
                connections: nextConnections,
              })
              return {
                ...curr,
                connections: nextConnections,
                connected: composed.connected,
                connecting: composed.connecting,
                error: composed.error,
              }
            })
          },
          onMessage: (payload: GovernanceStreamPayload) => {
            if (requestEpoch !== sourceEpochs[sourceKey]) return
            scheduleStoreUpdate(sourceKey, payload)
          },
          config: resolved.config,
        })

        if (requestEpoch !== sourceEpochs[sourceKey]) {
          unsubscribe()
          return
        }
        clearSubscriptionForSource(sourceKey)
        currentUnsubscribes[sourceKey] = unsubscribe
      } catch (err) {
        set((curr) => ({
          ...curr,
          connections: {
            ...curr.connections,
            [sourceKey]: {
              connected: false,
              connecting: false,
              error: err instanceof Error ? err.message : "Failed to connect datasource.",
              lastMessageAt: curr.connections[sourceKey]?.lastMessageAt ?? null,
            },
          },
          connecting: Object.values(curr.connections).some((c) => c.connecting),
          error: err instanceof Error ? err.message : "Failed to connect datasource.",
        }))
      }
    },

    disconnectSource: (sourceKey) => {
      sourceEpochs[sourceKey] = (sourceEpochs[sourceKey] ?? 0) + 1
      clearSubscriptionForSource(sourceKey)

      set((curr) => {
        const nextActive = curr.activeSources.filter((k) => k !== sourceKey)
        persistActiveSources(nextActive)

        const nextConnections = { ...curr.connections }
        delete nextConnections[sourceKey]

        const nextSnapshotsBySource = { ...curr.snapshotsBySource }
        const nextEventsBySource = { ...curr.eventsBySource }
        const nextHistoryBySource = { ...curr.historyBySource }
        delete nextSnapshotsBySource[sourceKey]
        delete nextEventsBySource[sourceKey]
        delete nextHistoryBySource[sourceKey]

        const composed = getComposedData({
          activeSources: nextActive,
          snapshotsBySource: nextSnapshotsBySource,
          eventsBySource: nextEventsBySource,
          historyBySource: nextHistoryBySource,
          connections: nextConnections,
        })

        return {
          ...curr,
          source: curr.source === sourceKey ? (nextActive[0] ?? null) : curr.source,
          activeSources: nextActive,
          connections: nextConnections,
          snapshotsBySource: nextSnapshotsBySource,
          eventsBySource: nextEventsBySource,
          historyBySource: nextHistoryBySource,
          stabilityBySource: composed.stabilityBySource,
          snapshot: composed.snapshot,
          events: composed.events,
          history: composed.history,
          connected: composed.connected,
          connecting: composed.connecting,
          error: composed.error,
          lastMessageAt: composed.lastMessageAt,
        }
      })
    },

    setActiveSources: (keys) => {
      const unique = Array.from(new Set(keys.filter(Boolean)))
      persistActiveSources(unique)
      set((curr) => ({ ...curr, activeSources: unique }))

      const state = useGovernanceStore.getState()
      const existing = Object.keys(state.connections)
      for (const key of existing) {
        if (!unique.includes(key)) {
          state.disconnectSource(key)
        }
      }
      for (const key of unique) {
        const conn = state.connections[key]
        const hasLiveSubscription = Boolean(currentUnsubscribes[key])
        if (!conn || (!conn.connected && !conn.connecting && !hasLiveSubscription)) {
          void state.connectSource(key)
        }
      }
    },

    setMultiSourceMode: (enabled) => {
      persistMultiSourceMode(enabled)
      set((curr) => ({ ...curr, multiSourceMode: enabled }))
    },

    connect: async (sourceKey) => {
      const state = useGovernanceStore.getState()
      persistSource(sourceKey)
      state.setMultiSourceMode(false)

      const existing = [...state.activeSources]
      for (const key of existing) {
        state.disconnectSource(key)
      }

      set((curr) => ({
        ...curr,
        source: sourceKey,
        activeSources: [sourceKey],
        error: null,
        snapshot: null,
        events: [],
        history: [],
        stabilityHistory: [],
      }))
      persistActiveSources([sourceKey])

      await useGovernanceStore.getState().connectSource(sourceKey)
    },

    disconnect: () => {
      const state = useGovernanceStore.getState()
      for (const key of [...state.activeSources]) {
        state.disconnectSource(key)
      }
      clearAllSubscriptions()
      resetHealthMetrics()
      persistSource(null)
      persistActiveSources([])

      set((curr) => ({
        ...curr,
        connected: false,
        connecting: false,
        source: null,
        activeSources: [],
        connections: {},
        snapshotsBySource: {},
        eventsBySource: {},
        historyBySource: {},
        stabilityBySource: {},
        lastMessageAt: null,
        snapshot: null,
        events: [],
        history: [],
        stabilityHistory: [],
        error: null,
      }))
    },

    reset: () => {
      clearAllSubscriptions()
      seenEventIds.clear()
      resetHealthMetrics()
      persistSource(null)
      persistActiveSources([])
      persistMultiSourceMode(false)
      sourceEpochs = {}
      set({
        connected: false,
        source: null,
        activeSources: [],
        multiSourceMode: false,
        connections: {},
        snapshotsBySource: {},
        eventsBySource: {},
        historyBySource: {},
        stabilityBySource: {},
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

export function getComposedSnapshot(activeSources: string[]): GovernanceSnapshot | null {
  const state = useGovernanceStore.getState()
  return getComposedData({
    activeSources,
    snapshotsBySource: state.snapshotsBySource,
    eventsBySource: state.eventsBySource,
    historyBySource: state.historyBySource,
    connections: state.connections,
  }).snapshot
}

// ---------------------------------------------------------------------------
// Auto-reconnect on mount
// ---------------------------------------------------------------------------

if (typeof window !== "undefined") {
  const multiMode = loadPersistedMultiSourceMode()
  const persistedActive = loadPersistedActiveSources()
  const persistedSource = loadPersistedSource()

  setTimeout(() => {
    const state = useGovernanceStore.getState()
    state.setMultiSourceMode(multiMode)

    if (multiMode && persistedActive.length > 0) {
      state.setActiveSources(persistedActive)
      return
    }

    if (!multiMode && persistedSource) {
      void state.connect(persistedSource)
    }
  }, 0)
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
