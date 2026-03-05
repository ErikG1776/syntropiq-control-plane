import type { GovernanceMessageHandler, GovernanceSnapshot, Unsubscribe } from "@/lib/governance/schema"
import { mapBackendEventToCanonical, type BackendGovernanceEventV1 } from "@/lib/adapters/telemetry"

function streamSnapshot(ts: string): GovernanceSnapshot {
  return {
    timestamp: ts,
    source: "live_events_stream",
    agents: [],
    thresholds: {
      trustThreshold: 0,
      suppressionThreshold: 0,
      driftDelta: 0,
    },
    eventCount: 0,
    suppressedCount: 0,
    healthy: true,
  }
}

export async function connectEventsSse(opts: {
  onMessage: GovernanceMessageHandler
  onStatus?: (s: { connected: boolean; message?: string }) => void
}): Promise<Unsubscribe> {
  let stopped = false
  let eventSource: EventSource | null = null

  opts.onStatus?.({ connected: false, message: "Connecting to governance event stream..." })

  try {
    const [snapshotRes, recentRes] = await Promise.all([
      fetch("/api/control-plane/snapshot", { cache: "no-store" }),
      fetch("/api/control-plane/events", { cache: "no-store" }),
    ])

    const snapshotJson = snapshotRes.ok ? await snapshotRes.json() : null
    const recentJson = recentRes.ok ? await recentRes.json() : []
    const recentEvents = Array.isArray(recentJson)
      ? recentJson.map((evt) => evt)
      : []

    if (snapshotJson && snapshotJson.snapshot && Array.isArray(snapshotJson.events)) {
      opts.onMessage({
        snapshot: snapshotJson.snapshot,
        events: recentEvents,
      })
    }
  } catch {
    opts.onStatus?.({
      connected: false,
      message: "Unable to load initial telemetry snapshot",
    })
  }

  eventSource = new EventSource("/api/control-plane/events/stream")

  eventSource.onopen = () => {
    if (stopped) return
    opts.onStatus?.({ connected: true, message: "Governance event stream connected" })
  }

  eventSource.onerror = () => {
    if (stopped) return
    opts.onStatus?.({ connected: false, message: "Governance event stream disconnected" })
  }

  eventSource.addEventListener("governance_event", (evt) => {
    if (stopped) return
    try {
      const parsed = JSON.parse((evt as MessageEvent).data) as BackendGovernanceEventV1
      const mapped = mapBackendEventToCanonical(parsed)
      opts.onMessage({
        snapshot: streamSnapshot(mapped.timestamp),
        events: [mapped],
      })
    } catch {
      // Ignore malformed frames from backend.
    }
  })

  return () => {
    stopped = true
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    opts.onStatus?.({ connected: false, message: "Disconnected" })
  }
}
