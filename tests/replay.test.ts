import { describe, it, expect, vi, beforeEach } from "vitest"
import { runReplayStream } from "@/lib/datasources/replay"
import { safeNormalize } from "@/lib/datasources/normalize"

describe("runReplayStream", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("emits normalized frames from a timeline array", async () => {
    const timelineData = {
      timeline: [
        {
          agents: [{ id: "a1", trustScore: 0.8, status: "active" }],
          events: [{ id: "e1", type: "heartbeat", message: "tick" }],
        },
        {
          agents: [{ id: "a1", trustScore: 0.75, status: "probation" }],
          events: [{ id: "e2", type: "trust_update", message: "down" }],
        },
      ],
    }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(timelineData),
    }))

    const messages: unknown[] = []
    const statuses: { connected: boolean; message?: string }[] = []

    const unsub = await runReplayStream({
      source: "replay_infra_chain",
      replayPath: "/replays/test.json",
      speedMs: 10,
      normalize: (json) => safeNormalize(json, "replay_infra_chain"),
      onMessage: (p) => messages.push(p),
      onStatus: (s) => statuses.push(s),
    })

    // Wait for all frames to emit
    await new Promise((r) => setTimeout(r, 100))
    unsub()

    expect(messages.length).toBe(2)
    expect(statuses.some((s) => s.connected)).toBe(true)
  })

  it("handles fetch failure gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")))

    const statuses: { connected: boolean; message?: string }[] = []

    const unsub = await runReplayStream({
      source: "replay_infra_chain",
      replayPath: "/replays/missing.json",
      speedMs: 10,
      normalize: (json) => safeNormalize(json, "replay_infra_chain"),
      onMessage: () => {},
      onStatus: (s) => statuses.push(s),
    })

    unsub()
    expect(statuses.some((s) => s.message?.includes("failed"))).toBe(true)
  })

  it("handles non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }))

    const statuses: { connected: boolean; message?: string }[] = []

    const unsub = await runReplayStream({
      source: "replay_infra_chain",
      replayPath: "/replays/missing.json",
      speedMs: 10,
      normalize: (json) => safeNormalize(json, "replay_infra_chain"),
      onMessage: () => {},
      onStatus: (s) => statuses.push(s),
    })

    unsub()
    expect(statuses.some((s) => s.message?.includes("failed"))).toBe(true)
  })

  it("unsubscribe stops further emissions", async () => {
    const timelineData = {
      timeline: Array.from({ length: 20 }, (_, i) => ({
        agents: [{ id: "a1", trustScore: 0.5 + i * 0.01 }],
        events: [{ id: `e${i}`, type: "heartbeat", message: "tick" }],
      })),
    }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(timelineData),
    }))

    const messages: unknown[] = []

    const unsub = await runReplayStream({
      source: "replay_infra_chain",
      replayPath: "/replays/test.json",
      speedMs: 50,
      normalize: (json) => safeNormalize(json, "replay_infra_chain"),
      onMessage: (p) => messages.push(p),
    })

    // Wait for a couple frames then unsub
    await new Promise((r) => setTimeout(r, 30))
    unsub()

    const countAtUnsub = messages.length
    await new Promise((r) => setTimeout(r, 200))

    // No more messages should have been emitted
    expect(messages.length).toBe(countAtUnsub)
  })

  it("handles single-frame (non-timeline) format", async () => {
    const singleFrame = {
      agents: [{ id: "a1", trustScore: 0.9, status: "active" }],
      events: [{ id: "e1", type: "heartbeat", message: "ping" }],
    }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(singleFrame),
    }))

    const messages: unknown[] = []

    const unsub = await runReplayStream({
      source: "replay_infra_chain",
      replayPath: "/replays/single.json",
      speedMs: 10,
      normalize: (json) => safeNormalize(json, "replay_infra_chain"),
      onMessage: (p) => messages.push(p),
    })

    await new Promise((r) => setTimeout(r, 50))
    unsub()

    expect(messages.length).toBe(1)
  })
})
