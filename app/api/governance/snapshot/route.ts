import type { GovernanceStreamPayload } from "@/lib/governance/schema"

export async function GET() {
  const now = new Date().toISOString()
  const payload: GovernanceStreamPayload = {
    snapshot: {
      timestamp: now,
      source: "live_api",
      runId: "stub-run",
      sequence: 1,
      healthy: true,
      agents: [
        {
          id: "agent_stub_1",
          trustScore: 0.98,
          authorityWeight: 0.91,
          status: "active",
          capabilities: ["monitoring"],
          labels: { env: "dev", cluster: "cp-1" },
        },
      ],
      thresholds: {
        trustThreshold: 0.7,
        suppressionThreshold: 0.5,
        driftDelta: 0.08,
      },
      eventCount: 1,
      suppressedCount: 0,
    },
    events: [
      {
        id: `evt_${Date.now()}`,
        timestamp: now,
        type: "heartbeat",
        severity: "info",
        message: "live_api heartbeat",
        tags: ["stub", "api"],
      },
    ],
  }

  return Response.json(payload)
}
