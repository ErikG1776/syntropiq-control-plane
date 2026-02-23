import { resolveAdapter } from "@/lib/adapters"

const BACKEND_BASE_URL = process.env.BACKEND_URL || "http://localhost:8000"

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
    const [agentsRes, statsRes, eventsRes] = await Promise.all([
      fetch(`${BACKEND_BASE_URL}/api/v1/agents`, { cache: "no-store" }),
      fetch(`${BACKEND_BASE_URL}/api/v1/statistics`, { cache: "no-store" }),
      fetch(`${BACKEND_BASE_URL}/api/v1/events`, { cache: "no-store" }),
    ])

    if (!agentsRes.ok || !statsRes.ok) {
      return Response.json(unhealthyPayload(now), { status: 502 })
    }

    const [agentsJson, statsJson, eventsJson] = await Promise.all([
      agentsRes.json(),
      statsRes.json(),
      eventsRes.ok ? eventsRes.json() : [],
    ])

    const agents = (Array.isArray(agentsJson) ? agentsJson : []).map(
      (agent, idx) => {
        const trustScore =
          typeof agent?.trustScore === "number"
            ? agent.trustScore
            : typeof agent?.trust_score === "number"
              ? agent.trust_score
              : typeof agent?.trust === "number"
                ? agent.trust
                : 0

        const authorityWeight =
          typeof agent?.authorityWeight === "number"
            ? agent.authorityWeight
            : typeof agent?.authority_weight === "number"
              ? agent.authority_weight
              : typeof agent?.authority === "number"
                ? agent.authority
                : trustScore

        const rawStatus =
          typeof agent?.status === "string"
            ? agent.status
            : typeof agent?.state === "string"
              ? agent.state
              : "unknown"

        const normalizedStatus =
          rawStatus === "active" ||
          rawStatus === "probation" ||
          rawStatus === "suppressed"
            ? rawStatus
            : "unknown"

        return {
          id:
            typeof agent?.id === "string"
              ? agent.id
              : typeof agent?.agent_id === "string"
                ? agent.agent_id
                : `agent_${idx + 1}`,
          trustScore,
          authorityWeight,
          status: normalizedStatus,
          capabilities: Array.isArray(agent?.capabilities)
            ? agent.capabilities
            : undefined,
        }
      },
    )

    const thresholds = {
      trustThreshold:
        typeof statsJson?.trust_threshold === "number"
          ? statsJson.trust_threshold
          : typeof statsJson?.trustThreshold === "number"
            ? statsJson.trustThreshold
            : -1,
      suppressionThreshold:
        typeof statsJson?.suppression_threshold === "number"
          ? statsJson.suppression_threshold
          : typeof statsJson?.suppressionThreshold === "number"
            ? statsJson.suppressionThreshold
            : -1,
      driftDelta:
        typeof statsJson?.drift_delta === "number"
          ? statsJson.drift_delta
          : typeof statsJson?.driftDelta === "number"
            ? statsJson.driftDelta
            : -1,
    }

    const allowedTypes = new Set([
      "trust_update",
      "suppression",
      "probation",
      "mutation",
      "routing_freeze",
      "system_alert",
      "status_change",
      "threshold_breach",
      "heartbeat",
    ])
    const allowedSeverities = new Set(["info", "warn", "error", "critical"])

    const events = (Array.isArray(eventsJson) ? eventsJson : []).map(
      (event, idx) => {
        const type =
          typeof event?.type === "string" && allowedTypes.has(event.type)
            ? event.type
            : "system_alert"
        const severity =
          typeof event?.severity === "string" &&
          allowedSeverities.has(event.severity)
            ? event.severity
            : "info"
        const timestamp =
          typeof event?.timestamp === "string"
            ? event.timestamp
            : typeof event?.ts === "string"
              ? event.ts
              : now

        return {
          id: typeof event?.id === "string" ? event.id : `evt_${now}_${idx}`,
          timestamp,
          type,
          severity,
          message:
            typeof event?.message === "string"
              ? event.message
              : "Event emitted",
          agentId:
            typeof event?.agentId === "string"
              ? event.agentId
              : typeof event?.agent_id === "string"
                ? event.agent_id
                : undefined,
          metadata:
            event?.metadata && typeof event.metadata === "object"
              ? event.metadata
              : {},
        }
      },
    )

    const payload = {
      snapshot: {
        timestamp: now,
        source: "live_api" as const,
        agents,
        thresholds,
        eventCount: events.length,
        suppressedCount: agents.filter(
          (agent) => agent.status === "suppressed",
        ).length,
        healthy: true,
      },
      events,
    }

    return Response.json(payload, { status: 200 })
  } catch {
    return Response.json(unhealthyPayload(now), { status: 502 })
  }
}
