import { normalizePayload } from "@/lib/datasources/normalize"

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

    const payload = normalizePayload(
      { agents: agentsJson, statistics: statsJson, timestamp: now },
      "live_api",
    )
    const mappedEvents = (Array.isArray(eventsJson) ? eventsJson : []).map((evt) => ({
      id: `${evt.cycle_id}-${evt.type}-${evt.agent_id ?? "system"}`,
      timestamp: evt.timestamp,
      type: evt.type,
      severity: "info",
      message: evt.type,
      agentId: evt.agent_id ?? undefined,
      metadata: {
        ...evt.metadata,
        run_id: evt.run_id,
        cycle_id: evt.cycle_id,
        trust_before: evt.trust_before,
        trust_after: evt.trust_after,
        authority_before: evt.authority_before,
        authority_after: evt.authority_after,
      },
    }))
    const snapshot = {
      ...payload.snapshot,
      eventCount: mappedEvents.length,
    }

    return Response.json({ snapshot, events: mappedEvents }, { status: 200 })
  } catch {
    return Response.json(unhealthyPayload(now), { status: 502 })
  }
}
