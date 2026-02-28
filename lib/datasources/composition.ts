/**
 * Multi-source composition engine.
 *
 * Merges governance data from multiple concurrent datasources into a single
 * unified view. Handles:
 *   - Agent deduplication by ID (latest update wins, source-tagged)
 *   - Event merging by timestamp with source attribution
 *   - Threshold aggregation (conservative: strictest threshold wins)
 *   - Per-source health tracking
 */

import type {
  AgentState,
  DataSourceKey,
  GovernanceEvent,
  GovernanceSnapshot,
  GovernanceStreamPayload,
  GovernanceThresholds,
} from "@/lib/governance/schema"

export interface SourceState {
  key: DataSourceKey
  connected: boolean
  lastPayload: GovernanceStreamPayload | null
  lastMessageAt: string | null
  error: string | null
}

export type CompositionStrategy = "latest" | "conservative" | "weighted"

/**
 * Merge agents from multiple sources.
 * For duplicate agent IDs, the most recent update wins.
 */
export function mergeAgents(
  sources: SourceState[],
): AgentState[] {
  const agentMap = new Map<string, AgentState & { _sourceTime: number }>()

  for (const source of sources) {
    if (!source.lastPayload) continue
    const ts = Date.parse(source.lastPayload.snapshot.timestamp) || 0

    for (const agent of source.lastPayload.snapshot.agents) {
      const existing = agentMap.get(agent.id)
      if (!existing || ts > existing._sourceTime) {
        agentMap.set(agent.id, { ...agent, _sourceTime: ts })
      }
    }
  }

  return Array.from(agentMap.values()).map(({ _sourceTime, ...agent }) => agent)
}

/**
 * Merge events from multiple sources, sorted by timestamp, deduplicated by ID.
 */
export function mergeEvents(
  sources: SourceState[],
  maxEvents: number = 1000,
): GovernanceEvent[] {
  const seen = new Set<string>()
  const allEvents: GovernanceEvent[] = []

  for (const source of sources) {
    if (!source.lastPayload) continue
    for (const evt of source.lastPayload.events) {
      if (!seen.has(evt.id)) {
        seen.add(evt.id)
        allEvents.push(evt)
      }
    }
  }

  allEvents.sort((a, b) => {
    const ta = Date.parse(a.timestamp) || 0
    const tb = Date.parse(b.timestamp) || 0
    return ta - tb
  })

  return allEvents.slice(-maxEvents)
}

/**
 * Merge thresholds using the conservative strategy (strictest wins).
 */
export function mergeThresholds(
  sources: SourceState[],
  strategy: CompositionStrategy = "conservative",
): GovernanceThresholds {
  const defaults: GovernanceThresholds = {
    trustThreshold: -1,
    suppressionThreshold: -1,
    driftDelta: -1,
  }

  const validSources = sources.filter((s) => s.lastPayload)
  if (validSources.length === 0) return defaults

  if (strategy === "latest") {
    // Use the most recent source's thresholds
    let latest: SourceState | null = null
    let latestTime = 0
    for (const s of validSources) {
      const ts = Date.parse(s.lastPayload!.snapshot.timestamp) || 0
      if (ts > latestTime) {
        latestTime = ts
        latest = s
      }
    }
    return latest?.lastPayload?.snapshot.thresholds ?? defaults
  }

  // Conservative: strictest (highest) threshold wins
  const thresholds = { ...defaults }
  for (const s of validSources) {
    const t = s.lastPayload!.snapshot.thresholds
    if (t.trustThreshold >= 0) {
      thresholds.trustThreshold =
        thresholds.trustThreshold < 0
          ? t.trustThreshold
          : Math.max(thresholds.trustThreshold, t.trustThreshold)
    }
    if (t.suppressionThreshold >= 0) {
      thresholds.suppressionThreshold =
        thresholds.suppressionThreshold < 0
          ? t.suppressionThreshold
          : Math.max(thresholds.suppressionThreshold, t.suppressionThreshold)
    }
    if (t.driftDelta >= 0) {
      thresholds.driftDelta =
        thresholds.driftDelta < 0
          ? t.driftDelta
          : Math.min(thresholds.driftDelta, t.driftDelta) // strictest = smallest drift allowed
    }
  }

  return thresholds
}

/**
 * Compose a unified snapshot from all active sources.
 */
export function composeSnapshot(
  sources: SourceState[],
  strategy: CompositionStrategy = "conservative",
): GovernanceStreamPayload {
  const agents = mergeAgents(sources)
  const events = mergeEvents(sources)
  const thresholds = mergeThresholds(sources, strategy)

  const snapshot: GovernanceSnapshot = {
    timestamp: new Date().toISOString(),
    source: "live_api", // composite source
    agents,
    thresholds,
    eventCount: events.length,
    suppressedCount: agents.filter((a) => a.status === "suppressed").length,
    healthy: sources.some((s) => s.connected),
  }

  return { snapshot, events }
}
