import type { AgentState, GovernanceEvent, GovernanceEventType } from "@/lib/governance/schema"

const BACKEND_BASE_URL = "http://localhost:8000"

type JsonRecord = Record<string, unknown>

interface AgentResponse {
  id?: string
  agent_id?: string
  trust_score?: number
  trustScore?: number
  authority_weight?: number
  authorityWeight?: number
  status?: string
  state?: string
  capabilities?: unknown[]
  labels?: Record<string, unknown>
  last_decision_at?: string
  lastDecisionAt?: string
}

interface SystemStatisticsResponse {
  trust_threshold?: number
  trustThreshold?: number
  suppression_threshold?: number
  suppressionThreshold?: number
  drift_delta?: number
  driftDelta?: number
  event_count?: number
  eventCount?: number
  suppressed_count?: number
  suppressedCount?: number
  recent_events?: unknown[]
  events?: unknown[]
}

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

function toStatus(value: unknown): AgentState["status"] {
  const status = asString(value, "unknown").toLowerCase()
  if (status === "active" || status === "probation" || status === "suppressed") {
    return status
  }
  return "unknown"
}

function toEventType(value: unknown): GovernanceEventType {
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

function normalizeAgents(raw: unknown): AgentState[] {
  return asArray(raw).map((item, idx) => {
    const agent = item as AgentResponse
    const labelsInput = asRecord(agent.labels)
    const labels = Object.fromEntries(
      Object.entries(labelsInput)
        .map(([key, value]) => [key, asString(value)])
        .filter(([, value]) => value.length > 0),
    )
    const capabilities = asArray(agent.capabilities)
      .map((capability) => asString(capability))
      .filter(Boolean)

    const trustScore = asNumber(agent.trustScore, asNumber(agent.trust_score, 0))
    const rawAuthority = asNumber(agent.authorityWeight, asNumber(agent.authority_weight, -1))
    // Proxy: if backend doesn't provide authority_weight, use trustScore as proxy
    const authorityWeight = rawAuthority >= 0 ? rawAuthority : trustScore

    return {
      id: asString(agent.id || agent.agent_id, `agent_${idx + 1}`),
      trustScore,
      authorityWeight,
      status: toStatus(agent.status || agent.state),
      capabilities: capabilities.length > 0 ? capabilities : undefined,
      labels: Object.keys(labels).length > 0 ? labels : undefined,
      lastDecisionAt: asString(agent.lastDecisionAt || agent.last_decision_at) || undefined,
    }
  })
}

function normalizeEvents(raw: unknown, now: string): GovernanceEvent[] {
  return asArray(raw).map((item, idx) => {
    const event = asRecord(item)
    const tags = asArray(event.tags).map((tag) => asString(tag)).filter(Boolean)

    return {
      id: asString(event.id, `evt_${Date.now()}_${idx}`),
      timestamp: asString(event.timestamp || event.ts, now),
      type: toEventType(event.type),
      severity: toSeverity(event.severity || event.level),
      message: asString(event.message, "Event emitted"),
      agentId: asString(event.agentId || event.agent_id) || undefined,
      tags: tags.length > 0 ? tags : undefined,
      metadata: asRecord(event.metadata),
    }
  })
}

function toCanonicalPayload(
  agentsResponse: unknown,
  statisticsResponse: unknown,
  now: string,
) {
  const agents = normalizeAgents(agentsResponse)
  const stats = statisticsResponse as SystemStatisticsResponse
  const events = normalizeEvents(stats.recent_events || stats.events, now)
  const suppressedCount =
    asNumber(stats.suppressedCount, asNumber(stats.suppressed_count, -1)) >= 0
      ? asNumber(stats.suppressedCount, asNumber(stats.suppressed_count, 0))
      : agents.filter((agent) => agent.status === "suppressed").length

  return {
    snapshot: {
      timestamp: now,
      source: "live_api",
      agents,
      thresholds: {
        // Use -1 sentinel when backend doesn't provide thresholds; UI renders "—"
        trustThreshold: asNumber(stats.trustThreshold, asNumber(stats.trust_threshold, -1)),
        suppressionThreshold: asNumber(
          stats.suppressionThreshold,
          asNumber(stats.suppression_threshold, -1),
        ),
        driftDelta: asNumber(stats.driftDelta, asNumber(stats.drift_delta, -1)),
      },
      eventCount: asNumber(stats.eventCount, asNumber(stats.event_count, events.length)),
      suppressedCount,
      healthy: true,
    },
    events,
  }
}

function unhealthyPayload(now: string) {
  return {
    snapshot: {
      timestamp: now,
      source: "live_api",
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

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const now = new Date().toISOString()

  try {
    const [agentsRes, statsRes] = await Promise.all([
      fetch(`${BACKEND_BASE_URL}/api/v1/agents`, { cache: "no-store" }),
      fetch(`${BACKEND_BASE_URL}/api/v1/statistics`, { cache: "no-store" }),
    ])

    if (!agentsRes.ok || !statsRes.ok) {
      return Response.json(unhealthyPayload(now), { status: 200 })
    }

    const [agentsJson, statsJson] = await Promise.all([agentsRes.json(), statsRes.json()])
    const payload = toCanonicalPayload(agentsJson, statsJson, now)
    return Response.json(payload, { status: 200 })
  } catch {
    return Response.json(unhealthyPayload(now), { status: 200 })
  }
}
