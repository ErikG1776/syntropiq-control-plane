import { describe, it, expect, beforeEach, vi } from "vitest"

// We need to mock the datasources module BEFORE importing the store,
// because the store imports dataSources at module scope.

// Mock datasources with a controllable replay source
const mockConnect = vi.fn()

vi.mock("@/lib/datasources", () => ({
  dataSources: {
    replay_infra_chain: {
      key: "replay_infra_chain",
      label: "Infra Chain",
      mode: "replay",
      config: {},
      connect: async (opts: { onMessage: (p: unknown) => void; onStatus: (s: { connected: boolean }) => void }) => {
        mockConnect(opts)
        return () => {}
      },
    },
  },
}))

// Now import the store — it will use the mocked dataSources
import {
  useGovernanceStore,
  getConnectionHealth,
  getAgentCount,
  getSuppressedCount,
  getMutationCount,
  getEventsCount,
  getStreamLatencyMs,
  getEventsPerMinute,
  getTrustTrend,
  getRecentSuppressionTransitions,
} from "@/store/governance-store"
import type { GovernanceStreamPayload } from "@/lib/governance/schema"

// Helper: build a minimal valid payload
function makePayload(overrides?: Partial<{
  agents: GovernanceStreamPayload["snapshot"]["agents"]
  events: GovernanceStreamPayload["events"]
  timestamp: string
}>): GovernanceStreamPayload {
  return {
    snapshot: {
      timestamp: overrides?.timestamp ?? new Date().toISOString(),
      source: "replay_infra_chain",
      agents: overrides?.agents ?? [
        { id: "a1", trustScore: 0.8, authorityWeight: 0.7, status: "active" },
      ],
      thresholds: { trustThreshold: 0.5, suppressionThreshold: 0.2, driftDelta: 0.1 },
      eventCount: overrides?.events?.length ?? 1,
      suppressedCount: 0,
    },
    events: overrides?.events ?? [
      {
        id: `evt_${Date.now()}_${Math.random()}`,
        timestamp: new Date().toISOString(),
        type: "trust_update",
        severity: "info",
        message: "trust updated",
      },
    ],
  }
}

// Helper: wait for RAF flush (our setup polyfills RAF with setTimeout(0))
// Need enough time for setTimeout(0) in RAF polyfill to fire + microtask queue
function flushRAF(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50))
}

describe("governance store", () => {
  beforeEach(() => {
    // Reset the store to initial state
    useGovernanceStore.getState().reset()
    mockConnect.mockClear()
  })

  describe("initial state", () => {
    it("starts disconnected with no snapshot", () => {
      const state = useGovernanceStore.getState()
      expect(state.connected).toBe(false)
      expect(state.connecting).toBe(false)
      expect(state.snapshot).toBeNull()
      expect(state.events).toEqual([])
      expect(state.history).toEqual([])
      expect(state.error).toBeNull()
    })
  })

  describe("connect", () => {
    it("sets connecting=true while connecting", async () => {
      // Don't await — check intermediate state
      const promise = useGovernanceStore.getState().connect("replay_infra_chain")
      // The store should be in connecting state
      expect(useGovernanceStore.getState().connecting).toBe(true)
      expect(useGovernanceStore.getState().source).toBe("replay_infra_chain")
      await promise
    })

    it("calls datasource connect with onMessage and onStatus", async () => {
      await useGovernanceStore.getState().connect("replay_infra_chain")
      expect(mockConnect).toHaveBeenCalledTimes(1)
      const opts = mockConnect.mock.calls[0][0]
      expect(typeof opts.onMessage).toBe("function")
      expect(typeof opts.onStatus).toBe("function")
    })

    it("sets error for unknown datasource", async () => {
      await useGovernanceStore.getState().connect("live_api" as never)
      const state = useGovernanceStore.getState()
      expect(state.connected).toBe(false)
      expect(state.error).toContain("not configured")
    })
  })

  describe("disconnect", () => {
    it("resets connected state", async () => {
      await useGovernanceStore.getState().connect("replay_infra_chain")
      // Simulate the source calling onStatus
      const opts = mockConnect.mock.calls[0][0]
      opts.onStatus({ connected: true })

      expect(useGovernanceStore.getState().connected).toBe(true)

      useGovernanceStore.getState().disconnect()
      const state = useGovernanceStore.getState()
      expect(state.connected).toBe(false)
      expect(state.source).toBeNull()
    })
  })

  describe("message ingestion", () => {
    it("applies payload via onMessage → RAF flush", async () => {
      await useGovernanceStore.getState().connect("replay_infra_chain")
      const opts = mockConnect.mock.calls[0][0]

      const payload = makePayload()
      opts.onMessage(payload)
      await flushRAF()

      const state = useGovernanceStore.getState()
      expect(state.snapshot).not.toBeNull()
      expect(state.snapshot!.agents).toHaveLength(1)
      expect(state.snapshot!.agents[0].id).toBe("a1")
      expect(state.events.length).toBeGreaterThanOrEqual(1)
    })

    it("accumulates stability history", async () => {
      await useGovernanceStore.getState().connect("replay_infra_chain")
      const opts = mockConnect.mock.calls[0][0]

      for (let i = 0; i < 5; i++) {
        opts.onMessage(makePayload({
          events: [{ id: `e${i}`, timestamp: new Date().toISOString(), type: "heartbeat", severity: "info", message: "tick" }],
        }))
        await flushRAF()
      }

      const state = useGovernanceStore.getState()
      expect(state.stabilityHistory.length).toBeGreaterThanOrEqual(1)
      // Stability should be bounded [0, 1]
      for (const entry of state.stabilityHistory) {
        expect(entry.value).toBeGreaterThanOrEqual(0)
        expect(entry.value).toBeLessThanOrEqual(1)
      }
    })

    it("caps events at MAX_EVENTS (1000)", async () => {
      await useGovernanceStore.getState().connect("replay_infra_chain")
      const opts = mockConnect.mock.calls[0][0]

      // Send many events in batches
      for (let batch = 0; batch < 20; batch++) {
        const events = Array.from({ length: 60 }, (_, i) => ({
          id: `evt_${batch}_${i}`,
          timestamp: new Date().toISOString(),
          type: "heartbeat" as const,
          severity: "info" as const,
          message: "tick",
        }))
        opts.onMessage(makePayload({ events }))
        await flushRAF()
      }

      const state = useGovernanceStore.getState()
      expect(state.events.length).toBeLessThanOrEqual(1000)
    })
  })

  describe("event deduplication", () => {
    it("deduplicates events with the same id", async () => {
      await useGovernanceStore.getState().connect("replay_infra_chain")
      const opts = mockConnect.mock.calls[0][0]

      const event = {
        id: "duplicate_evt",
        timestamp: new Date().toISOString(),
        type: "trust_update" as const,
        severity: "info" as const,
        message: "duplicate",
      }

      opts.onMessage(makePayload({ events: [event] }))
      await flushRAF()

      opts.onMessage(makePayload({ events: [event] }))
      await flushRAF()

      const state = useGovernanceStore.getState()
      const dupeCount = state.events.filter((e) => e.id === "duplicate_evt").length
      expect(dupeCount).toBe(1)
    })
  })

  describe("derived selectors", () => {
    it("getAgentCount returns 0 when no snapshot", () => {
      expect(getAgentCount()).toBe(0)
    })

    it("getSuppressedCount returns 0 when no snapshot", () => {
      expect(getSuppressedCount()).toBe(0)
    })

    it("getMutationCount counts mutation events", async () => {
      await useGovernanceStore.getState().connect("replay_infra_chain")
      const opts = mockConnect.mock.calls[0][0]

      opts.onMessage(
        makePayload({
          events: [
            { id: "m1", timestamp: new Date().toISOString(), type: "mutation", severity: "info", message: "mutated" },
            { id: "m2", timestamp: new Date().toISOString(), type: "trust_update", severity: "info", message: "trust" },
            { id: "m3", timestamp: new Date().toISOString(), type: "mutation", severity: "warn", message: "mutated again" },
          ],
        }),
      )
      await flushRAF()

      expect(getMutationCount()).toBe(2)
    })

    it("getEventsCount returns total event count", async () => {
      await useGovernanceStore.getState().connect("replay_infra_chain")
      const opts = mockConnect.mock.calls[0][0]

      opts.onMessage(
        makePayload({
          events: [
            { id: "e1", timestamp: new Date().toISOString(), type: "heartbeat", severity: "info", message: "a" },
            { id: "e2", timestamp: new Date().toISOString(), type: "heartbeat", severity: "info", message: "b" },
          ],
        }),
      )
      await flushRAF()

      expect(getEventsCount()).toBe(2)
    })

    it("getStreamLatencyMs returns null when no messages", () => {
      expect(getStreamLatencyMs()).toBeNull()
    })

    it("getEventsPerMinute counts recent events", async () => {
      await useGovernanceStore.getState().connect("replay_infra_chain")
      const opts = mockConnect.mock.calls[0][0]

      const now = new Date().toISOString()
      opts.onMessage(
        makePayload({
          events: [
            { id: "r1", timestamp: now, type: "heartbeat", severity: "info", message: "recent" },
            { id: "r2", timestamp: now, type: "heartbeat", severity: "info", message: "recent" },
          ],
        }),
      )
      await flushRAF()

      expect(getEventsPerMinute()).toBe(2)
    })

    it("getTrustTrend returns 'unknown' with insufficient history", () => {
      expect(getTrustTrend("a1")).toBe("unknown")
    })

    it("getRecentSuppressionTransitions returns [] with insufficient history", () => {
      expect(getRecentSuppressionTransitions()).toEqual([])
    })
  })

  describe("connection health", () => {
    it("returns zeroed metrics after reset", () => {
      const health = getConnectionHealth()
      expect(health.messagesReceived).toBe(0)
      expect(health.messagesDropped).toBe(0)
      expect(health.validationWarnings).toBe(0)
    })

    it("tracks messagesReceived after ingestion", async () => {
      await useGovernanceStore.getState().connect("replay_infra_chain")
      const opts = mockConnect.mock.calls[0][0]

      opts.onMessage(makePayload())
      await flushRAF()

      const health = getConnectionHealth()
      expect(health.messagesReceived).toBeGreaterThanOrEqual(1)
    })
  })

  describe("reset", () => {
    it("clears all state back to initial", async () => {
      await useGovernanceStore.getState().connect("replay_infra_chain")
      const opts = mockConnect.mock.calls[0][0]
      opts.onStatus({ connected: true })
      opts.onMessage(makePayload())
      await flushRAF()

      useGovernanceStore.getState().reset()

      const state = useGovernanceStore.getState()
      expect(state.connected).toBe(false)
      expect(state.snapshot).toBeNull()
      expect(state.events).toEqual([])
      expect(state.history).toEqual([])
      expect(state.stabilityHistory).toEqual([])
      expect(state.error).toBeNull()
      expect(state.source).toBeNull()
    })
  })
})
