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

// ---------------------------------------------------------------------------
// Safe coercion helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Enum normalizers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Field normalizers
// ---------------------------------------------------------------------------

function normalizeThresholds(input: unknown): GovernanceThresholds {
  const src = asRecord(input)
  return {
    trustThreshold: asNumber(
      src.trustThreshold ?? src.trust_threshold,
      -1,
    ),
    suppressionThreshold: asNumber(
      src.suppressionThreshold ?? src.suppression_threshold,
      -1,
    ),
    driftDelta: asNumber(
      src.driftDelta ?? src.drift_delta,
      -1,
    ),
  }
}

export function normalizeAgent(raw: unknown, idx: number): AgentState {
  const src = asRecord(raw)

  const trustScore = asNumber(
    src.trustScore ?? src.trust_score ?? src.trust,
    0,
  )

  const rawAuthority = asNumber(
    src.authorityWeight ?? src.authority_weight ?? src.authority,
    -1,
  )

  const authorityWeight =
    rawAuthority >= 0 ? rawAuthority : trustScore

  return {
    id: asString(src.id ?? src.agent_id, `agent_${idx + 1}`),
    trustScore,
    authorityWeight,
    status: toStatus(src.status ?? src.state),
    capabilities: undefined,
    labels: undefined,
    lastDecisionAt: undefined,
  }
}

export function normalizeEvent(
  raw: unknown,
  idx: number,
  tsFallback: string,
): GovernanceEvent {
  const src = asRecord(raw)

  return {
    id: asString(src.id, `evt_${Date.now()}_${idx}`),
    timestamp: asString(src.timestamp ?? src.ts, tsFallback),
    type: toType(src.type),
    severity: toSeverity(src.severity ?? src.level),
    message: asString(src.message, "Event emitted"),
    agentId: asOptionalString(src.agentId ?? src.agent_id),
    metadata: asRecord(src.metadata),
  }
}

// ---------------------------------------------------------------------------
// Unified normalizer
// ---------------------------------------------------------------------------

export function normalizePayload(
  json: unknown,
  source: DataSourceKey,
): GovernanceStreamPayload {
  const now = new Date().toISOString()

  const root = asRecord(json)
  const summary = asRecord(root.summary)
  const frame = asRecord(root.frame)
  const snapshotSrc = asRecord(root.snapshot)
  const statistics = asRecord(root.statistics)
  const frameInputs = asRecord(frame.inputs)
  const frameOutputs = asRecord(frame.outputs)

  // --- Agents ---
  const agentsRaw =
    asArray(snapshotSrc.agents).length > 0
      ? asArray(snapshotSrc.agents)
      : asArray(frameOutputs.agentStates).length > 0
        ? asArray(frameOutputs.agentStates)
      : asArray(frame.agents).length > 0
        ? asArray(frame.agents)
        : asArray(root.agents).length > 0
          ? asArray(root.agents)
          : asArray(summary.agents)

  // --- Events ---
  const eventsRaw =
    asArray(root.events).length > 0
      ? asArray(root.events)
      : asArray(frame.events).length > 0
        ? asArray(frame.events)
        : asArray(frame.decisions).length > 0
          ? asArray(frame.decisions)
        : asArray(statistics.recent_events ?? statistics.events).length > 0
          ? asArray(statistics.recent_events ?? statistics.events)
          : asArray(summary.events)

  const agents = agentsRaw.map(normalizeAgent)
  const events = eventsRaw.map((evt, idx) =>
    normalizeEvent(evt, idx, now),
  )

  // *** FIXED THRESHOLD RESOLUTION ***
  const thresholds = normalizeThresholds(
    snapshotSrc.thresholds ??
      frame.thresholds ??
      frameOutputs.thresholds ??
      frameInputs.thresholds ??
      statistics.thresholds ??   // <-- critical fix
      statistics ??
      summary.thresholds,
  )

  const suppressedCount = agents.filter(
    (a) => a.status === "suppressed",
  ).length

  const eventCount =
    asNumber(
      snapshotSrc.eventCount ??
        statistics.eventCount ??
        statistics.event_count ??
        summary.eventCount,
      0,
    ) || events.length

  const snapshot: GovernanceSnapshot = {
    timestamp: asString(
      snapshotSrc.timestamp ??
        frame.timestamp ??
        root.timestamp,
      now,
    ),
    source,
    runId: asOptionalString(
      snapshotSrc.runId ??
        summary.runId ??
        root.runId,
    ),
    sequence: asOptionalNumber(
      snapshotSrc.sequence ??
        frame.sequence ??
        frame.cycleId ??
        root.sequence,
    ),
    healthy: asBoolean(
      snapshotSrc.healthy ??
        frame.healthy ??
        summary.healthy,
      true,
    ),
    agents,
    thresholds,
    eventCount,
    suppressedCount,
  }

  return { snapshot, events }
}

// ---------------------------------------------------------------------------
// Safe wrapper
// ---------------------------------------------------------------------------

function emptyPayload(source: DataSourceKey): GovernanceStreamPayload {
  return {
    snapshot: {
      timestamp: new Date().toISOString(),
      source,
      agents: [],
      thresholds: {
        trustThreshold: 0,
        suppressionThreshold: 0,
        driftDelta: 0,
      },
      eventCount: 0,
      suppressedCount: 0,
      healthy: false,
    },
    events: [],
  }
}

export function safeNormalize(
  json: unknown,
  source: DataSourceKey,
): GovernanceStreamPayload {
  try {
    return normalizePayload(json, source)
  } catch {
    return emptyPayload(source)
  }
}