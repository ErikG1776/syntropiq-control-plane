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
    const [agentsRes, statsRes] = await Promise.all([
      fetch(`${BACKEND_BASE_URL}/api/v1/agents`, { cache: "no-store" }),
      fetch(`${BACKEND_BASE_URL}/api/v1/statistics`, { cache: "no-store" }),
    ])

    if (!agentsRes.ok || !statsRes.ok) {
      return Response.json(unhealthyPayload(now), { status: 502 })
    }

    const [agentsJson, statsJson] = await Promise.all([
      agentsRes.json(),
      statsRes.json(),
    ])

    // Use the unified normalizer — same pipeline as replay/WS sources.
    // We pass the split REST response in a shape the normalizer understands:
    // { agents: [...], statistics: { thresholds, events, ... } }
    const payload = normalizePayload(
      { agents: agentsJson, statistics: statsJson, timestamp: now },
      "live_api",
    )

    return Response.json(payload, { status: 200 })
  } catch {
    return Response.json(unhealthyPayload(now), { status: 502 })
  }
}
