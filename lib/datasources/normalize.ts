import type {
  AgentState,
  AgentStatus,
  DataSourceKey,
  GovernanceEvent,
  GovernanceEventType,
  GovernanceSnapshot,
  GovernanceStreamPayload,
  GovernanceThresholds,
} from "@/lib/governance/schema"

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function asBoolean(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback
}

function toStatus(value: unknown): AgentStatus {
  const raw = asString(value, "unknown").toLowerCase()
  if (raw === "active" || raw === "probation" || raw === "suppressed") {
    return raw
  }
  return "unknown"
}

function toType(value: unknown): GovernanceEventType {
  const raw = asString(value, "system_alert").toLowerCase()
  switch (raw) {
    case "trust_update":
    case "suppression":
    case "probation":
    case "mutation":
    case "routing_freeze":
    case "system_alert":
    case "status_change":
    case "threshold_breach":
    case "heartbeat":
      return raw
    default:
      return "system_alert"
  }
}

function toSeverity(value: unknown): GovernanceEvent["severity"] {
  const raw = asString(value, "info").toLowerCase()
  switch (raw) {
    case "warn":
    case "error":
    case "critical":
      return raw
    default:
      return "info"
  }
}

function normalizeThresholds(input: unknown): GovernanceThresholds {
  const src = asRecord(input)
  return {
    trustThreshold: asNumber(src.trustThreshold, 0),
    suppressionThreshold: asNumber(src.suppressionThreshold, 0),
    driftDelta: asNumber(src.driftDelta, 0),
  }
}

function normalizeAgent(raw: unknown, idx: number): AgentState {
  const src = asRecord(raw)
  const capabilities = asArray(src.capabilities)
    .map((c) => asString(c))
    .filter(Boolean)
  const labelsSrc = asRecord(src.labels)
  const labels = Object.fromEntries(
    Object.entries(labelsSrc)
      .map(([k, v]) => [k, asString(v)])
      .filter(([, v]) => v.length > 0),
  )

  return {
    id: asString(src.id, `agent_${idx + 1}`),
    trustScore: asNumber(src.trustScore, asNumber(src.trust, 0)),
    authorityWeight: asNumber(src.authorityWeight, asNumber(src.authority, 0)),
    status: toStatus(src.status),
    capabilities: capabilities.length > 0 ? capabilities : undefined,
    labels: Object.keys(labels).length > 0 ? labels : undefined,
    lastDecisionAt: asOptionalString(src.lastDecisionAt || src.last_decision_at || src.ts),
  }
}

function normalizeEvent(raw: unknown, idx: number, tsFallback: string): GovernanceEvent {
  const src = asRecord(raw)
  const tags = asArray(src.tags).map((t) => asString(t)).filter(Boolean)
  return {
    id: asString(src.id, `evt_${Date.now()}_${idx}`),
    timestamp: asString(src.timestamp || src.ts, tsFallback),
    type: toType(src.type),
    severity: toSeverity(src.severity || src.level),
    message: asString(src.message, "Event emitted"),
    agentId: asOptionalString(src.agentId || src.agent_id),
    tags: tags.length > 0 ? tags : undefined,
    metadata: asRecord(src.metadata),
  }
}

function normalizePayload(json: unknown, source: DataSourceKey): GovernanceStreamPayload {
  const now = new Date().toISOString()
  const root = asRecord(json)
  const summary = asRecord(root.summary)
  const frame = asRecord(root.frame)
  const snapshotSrc = asRecord(root.snapshot)
  const agentsRaw =
    asArray(snapshotSrc.agents).length > 0
      ? asArray(snapshotSrc.agents)
      : asArray(frame.agents).length > 0
        ? asArray(frame.agents)
        : asArray(summary.agents)
  const eventsRaw =
    asArray(root.events).length > 0
      ? asArray(root.events)
      : asArray(frame.events).length > 0
        ? asArray(frame.events)
        : asArray(summary.events)

  const agents = agentsRaw.map(normalizeAgent)
  const events = eventsRaw.map((evt, idx) => normalizeEvent(evt, idx, now))
  const thresholds = normalizeThresholds(
    snapshotSrc.thresholds || frame.thresholds || summary.thresholds,
  )
  const suppressedCount = agents.filter((a) => a.status === "suppressed").length
  const eventCount =
    asNumber(snapshotSrc.eventCount, asNumber(summary.eventCount, 0)) || events.length

  const snapshot: GovernanceSnapshot = {
    timestamp: asString(snapshotSrc.timestamp || frame.timestamp || root.timestamp, now),
    source,
    runId: asOptionalString(snapshotSrc.runId || summary.runId || root.runId),
    sequence: asOptionalNumber(snapshotSrc.sequence || frame.sequence || root.sequence),
    healthy: asBoolean(snapshotSrc.healthy ?? frame.healthy ?? summary.healthy, true),
    agents,
    thresholds,
    eventCount,
    suppressedCount,
  }

  return { snapshot, events }
}

function safeNormalize(json: unknown, source: DataSourceKey): GovernanceStreamPayload {
  try {
    return normalizePayload(json, source)
  } catch {
    return {
      snapshot: {
        timestamp: new Date().toISOString(),
        source,
        agents: [],
        thresholds: { trustThreshold: 0, suppressionThreshold: 0, driftDelta: 0 },
        eventCount: 0,
        suppressedCount: 0,
        healthy: false,
      },
      events: [],
    }
  }
}

export function normalizeInfraChain(json: unknown): GovernanceStreamPayload {
  return safeNormalize(json, "replay_infra_chain")
}

export function normalizeReadmission(json: unknown): GovernanceStreamPayload {
  return safeNormalize(json, "replay_readmission")
}

export function normalizeFinance(json: unknown): GovernanceStreamPayload {
  return safeNormalize(json, "replay_finance")
}
