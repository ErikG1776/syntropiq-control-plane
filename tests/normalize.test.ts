import { describe, it, expect } from "vitest"
import {
  normalizeAgent,
  normalizeEvent,
  normalizePayload,
  safeNormalize,
  validatePayload,
  normalizeInfraChain,
  normalizeReadmission,
  normalizeFinance,
  normalizeGovernanceDemo,
  normalizeLiveApi,
  normalizeLiveWs,
} from "@/lib/datasources/normalize"

// ---------------------------------------------------------------------------
// normalizeAgent
// ---------------------------------------------------------------------------

describe("normalizeAgent", () => {
  it("normalizes a fully-formed agent", () => {
    const agent = normalizeAgent(
      {
        id: "agent_1",
        trustScore: 0.85,
        authorityWeight: 0.7,
        status: "active",
        capabilities: ["plan", "execute"],
        labels: { team: "infra" },
        lastDecisionAt: "2025-01-01T00:00:00Z",
      },
      0,
    )
    expect(agent.id).toBe("agent_1")
    expect(agent.trustScore).toBe(0.85)
    expect(agent.authorityWeight).toBe(0.7)
    expect(agent.status).toBe("active")
    expect(agent.capabilities).toEqual(["plan", "execute"])
    expect(agent.labels).toEqual({ team: "infra" })
    expect(agent.lastDecisionAt).toBe("2025-01-01T00:00:00Z")
  })

  it("generates fallback id from index when missing", () => {
    const agent = normalizeAgent({}, 4)
    expect(agent.id).toBe("agent_5")
  })

  it("reads snake_case field names", () => {
    const agent = normalizeAgent(
      {
        agent_id: "snake_agent",
        trust_score: 0.6,
        authority_weight: 0.5,
        state: "probation",
        last_decision_at: "2025-06-01T00:00:00Z",
      },
      0,
    )
    expect(agent.id).toBe("snake_agent")
    expect(agent.trustScore).toBe(0.6)
    expect(agent.authorityWeight).toBe(0.5)
    expect(agent.status).toBe("probation")
    expect(agent.lastDecisionAt).toBe("2025-06-01T00:00:00Z")
  })

  it("proxies authorityWeight from trustScore when not provided", () => {
    const agent = normalizeAgent({ trustScore: 0.9 }, 0)
    expect(agent.authorityWeight).toBe(0.9)
  })

  it("normalizes unknown status values to 'unknown'", () => {
    const agent = normalizeAgent({ status: "banana" }, 0)
    expect(agent.status).toBe("unknown")
  })

  it("handles null/undefined input gracefully", () => {
    const agent = normalizeAgent(null, 0)
    expect(agent.id).toBe("agent_1")
    expect(agent.trustScore).toBe(0)
    expect(agent.status).toBe("unknown")
  })

  it("strips empty capabilities and labels", () => {
    const agent = normalizeAgent({ capabilities: [], labels: {} }, 0)
    expect(agent.capabilities).toBeUndefined()
    expect(agent.labels).toBeUndefined()
  })

  it("filters non-string capabilities", () => {
    const agent = normalizeAgent({ capabilities: ["plan", 123, "", "exec"] }, 0)
    expect(agent.capabilities).toEqual(["plan", "exec"])
  })

  it("handles trust field alias", () => {
    const agent = normalizeAgent({ trust: 0.77 }, 0)
    expect(agent.trustScore).toBe(0.77)
  })

  it("handles authority field alias", () => {
    const agent = normalizeAgent({ authority: 0.3 }, 0)
    expect(agent.authorityWeight).toBe(0.3)
  })
})

// ---------------------------------------------------------------------------
// normalizeEvent
// ---------------------------------------------------------------------------

describe("normalizeEvent", () => {
  const ts = "2025-01-01T00:00:00Z"

  it("normalizes a fully-formed event", () => {
    const evt = normalizeEvent(
      {
        id: "evt_1",
        timestamp: "2025-01-01T12:00:00Z",
        type: "trust_update",
        severity: "warn",
        message: "Trust changed",
        agentId: "agent_1",
        tags: ["trust"],
        metadata: { delta: 0.1 },
      },
      0,
      ts,
    )
    expect(evt.id).toBe("evt_1")
    expect(evt.timestamp).toBe("2025-01-01T12:00:00Z")
    expect(evt.type).toBe("trust_update")
    expect(evt.severity).toBe("warn")
    expect(evt.message).toBe("Trust changed")
    expect(evt.agentId).toBe("agent_1")
    expect(evt.tags).toEqual(["trust"])
    expect(evt.metadata).toEqual({ delta: 0.1 })
  })

  it("generates fallback id when missing", () => {
    const evt = normalizeEvent({}, 3, ts)
    expect(evt.id).toContain("evt_")
    expect(evt.id).toContain("_3")
  })

  it("falls back to tsFallback when timestamp is missing", () => {
    const evt = normalizeEvent({}, 0, ts)
    expect(evt.timestamp).toBe(ts)
  })

  it("reads snake_case agent_id", () => {
    const evt = normalizeEvent({ agent_id: "snake_agent" }, 0, ts)
    expect(evt.agentId).toBe("snake_agent")
  })

  it("defaults severity to info for unknown values", () => {
    const evt = normalizeEvent({ severity: "banana" }, 0, ts)
    expect(evt.severity).toBe("info")
  })

  it("normalizes all valid severity values", () => {
    for (const sev of ["info", "warn", "error", "critical"] as const) {
      const evt = normalizeEvent({ severity: sev }, 0, ts)
      expect(evt.severity).toBe(sev)
    }
  })

  it("defaults type to system_alert for unknown values", () => {
    const evt = normalizeEvent({ type: "nonexistent" }, 0, ts)
    expect(evt.type).toBe("system_alert")
  })

  it("normalizes all valid event types", () => {
    const types = [
      "trust_update",
      "suppression",
      "probation",
      "mutation",
      "routing_freeze",
      "system_alert",
      "status_change",
      "threshold_breach",
      "heartbeat",
    ] as const
    for (const t of types) {
      const evt = normalizeEvent({ type: t }, 0, ts)
      expect(evt.type).toBe(t)
    }
  })

  it("reads ts alias for timestamp", () => {
    const evt = normalizeEvent({ ts: "2025-03-01T00:00:00Z" }, 0, ts)
    expect(evt.timestamp).toBe("2025-03-01T00:00:00Z")
  })

  it("reads level alias for severity", () => {
    const evt = normalizeEvent({ level: "critical" }, 0, ts)
    expect(evt.severity).toBe("critical")
  })

  it("strips empty tags", () => {
    const evt = normalizeEvent({ tags: [] }, 0, ts)
    expect(evt.tags).toBeUndefined()
  })

  it("handles null input gracefully", () => {
    const evt = normalizeEvent(null, 0, ts)
    expect(evt.type).toBe("system_alert")
    expect(evt.severity).toBe("info")
    expect(evt.message).toBe("Event emitted")
  })
})

// ---------------------------------------------------------------------------
// normalizePayload — canonical shape
// ---------------------------------------------------------------------------

describe("normalizePayload", () => {
  it("normalizes canonical { snapshot, events } shape", () => {
    const result = normalizePayload(
      {
        snapshot: {
          timestamp: "2025-01-01T00:00:00Z",
          agents: [{ id: "a1", trustScore: 0.8, status: "active" }],
          thresholds: { trustThreshold: 0.5, suppressionThreshold: 0.2, driftDelta: 0.1 },
          eventCount: 1,
        },
        events: [{ id: "e1", type: "trust_update", severity: "info", message: "ok" }],
      },
      "replay_infra_chain",
    )
    expect(result.snapshot.agents).toHaveLength(1)
    expect(result.snapshot.agents[0].id).toBe("a1")
    expect(result.events).toHaveLength(1)
    expect(result.snapshot.source).toBe("replay_infra_chain")
  })

  it("normalizes frame-based shape { frame: { agents, events } }", () => {
    const result = normalizePayload(
      {
        frame: {
          agents: [{ id: "f1", trust: 0.5, status: "probation" }],
          events: [{ id: "fe1", type: "mutation", message: "changed" }],
          thresholds: { trustThreshold: 0.4 },
        },
      },
      "replay_finance",
    )
    expect(result.snapshot.agents).toHaveLength(1)
    expect(result.snapshot.agents[0].id).toBe("f1")
    expect(result.events).toHaveLength(1)
    expect(result.snapshot.thresholds.trustThreshold).toBe(0.4)
  })

  it("normalizes REST split shape { agents, statistics }", () => {
    const result = normalizePayload(
      {
        agents: [{ id: "r1", trustScore: 0.9, status: "active" }],
        statistics: {
          recent_events: [{ id: "re1", type: "heartbeat", message: "ping" }],
          trustThreshold: 0.6,
          suppressionThreshold: 0.3,
          driftDelta: 0.05,
        },
      },
      "live_api",
    )
    expect(result.snapshot.agents).toHaveLength(1)
    expect(result.events).toHaveLength(1)
    expect(result.snapshot.thresholds.trustThreshold).toBe(0.6)
  })

  it("normalizes summary shape { summary: { agents, events } }", () => {
    const result = normalizePayload(
      {
        summary: {
          agents: [{ id: "s1", trust: 0.7, status: "suppressed" }],
          events: [{ id: "se1", type: "suppression", message: "suppressed" }],
          thresholds: { trustThreshold: 0.3 },
        },
      },
      "replay_governance_demo",
    )
    expect(result.snapshot.agents).toHaveLength(1)
    expect(result.snapshot.agents[0].status).toBe("suppressed")
    expect(result.snapshot.suppressedCount).toBe(1)
  })

  it("counts suppressedCount correctly", () => {
    const result = normalizePayload(
      {
        snapshot: {
          agents: [
            { id: "a1", status: "suppressed" },
            { id: "a2", status: "active" },
            { id: "a3", status: "suppressed" },
          ],
        },
      },
      "live_api",
    )
    expect(result.snapshot.suppressedCount).toBe(2)
  })

  it("handles completely empty input", () => {
    const result = normalizePayload({}, "live_api")
    expect(result.snapshot.agents).toEqual([])
    expect(result.events).toEqual([])
    expect(result.snapshot.source).toBe("live_api")
  })

  it("reads sequence from root", () => {
    const result = normalizePayload({ sequence: 42 }, "live_ws")
    expect(result.snapshot.sequence).toBe(42)
  })

  it("reads runId from root", () => {
    const result = normalizePayload({ runId: "run_abc" }, "live_ws")
    expect(result.snapshot.runId).toBe("run_abc")
  })

  it("defaults healthy to true", () => {
    const result = normalizePayload({}, "live_api")
    expect(result.snapshot.healthy).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// safeNormalize — never throws
// ---------------------------------------------------------------------------

describe("safeNormalize", () => {
  it("returns valid payload for good input", () => {
    const result = safeNormalize(
      { snapshot: { agents: [{ id: "a1" }] } },
      "live_api",
    )
    expect(result.snapshot.agents).toHaveLength(1)
  })

  it("returns empty payload for null input", () => {
    const result = safeNormalize(null, "live_api")
    expect(result.snapshot.agents).toEqual([])
    expect(result.events).toEqual([])
    // null coerces to {} via asRecord, so normalizePayload succeeds with defaults
    // healthy defaults to true in normalizePayload
    expect(result.snapshot.healthy).toBe(true)
  })

  it("returns empty payload for undefined input", () => {
    const result = safeNormalize(undefined, "live_ws")
    expect(result.snapshot.agents).toEqual([])
  })

  it("returns empty payload for primitive input", () => {
    const result = safeNormalize("not json", "live_api")
    expect(result.snapshot.agents).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Source-specific wrappers
// ---------------------------------------------------------------------------

describe("source-specific normalizers", () => {
  const minimalInput = {
    snapshot: { agents: [{ id: "x" }] },
    events: [],
  }

  it("normalizeInfraChain sets source to replay_infra_chain", () => {
    expect(normalizeInfraChain(minimalInput).snapshot.source).toBe("replay_infra_chain")
  })

  it("normalizeReadmission sets source to replay_readmission", () => {
    expect(normalizeReadmission(minimalInput).snapshot.source).toBe("replay_readmission")
  })

  it("normalizeFinance sets source to replay_finance", () => {
    expect(normalizeFinance(minimalInput).snapshot.source).toBe("replay_finance")
  })

  it("normalizeGovernanceDemo sets source to replay_governance_demo", () => {
    expect(normalizeGovernanceDemo(minimalInput).snapshot.source).toBe("replay_governance_demo")
  })

  it("normalizeLiveApi sets source to live_api", () => {
    expect(normalizeLiveApi(minimalInput).snapshot.source).toBe("live_api")
  })

  it("normalizeLiveWs sets source to live_ws", () => {
    expect(normalizeLiveWs(minimalInput).snapshot.source).toBe("live_ws")
  })
})

// ---------------------------------------------------------------------------
// validatePayload
// ---------------------------------------------------------------------------

describe("validatePayload", () => {
  it("returns no warnings for valid payload", () => {
    const warnings = validatePayload({
      snapshot: {
        timestamp: "2025-01-01T00:00:00Z",
        source: "live_api",
        agents: [
          { id: "a1", trustScore: 0.8, authorityWeight: 0.6, status: "active" },
        ],
        thresholds: { trustThreshold: 0.5, suppressionThreshold: 0.2, driftDelta: 0.1 },
        eventCount: 1,
        suppressedCount: 0,
      },
      events: [
        {
          id: "e1",
          timestamp: "2025-01-01T00:00:00Z",
          type: "trust_update",
          severity: "info",
          message: "ok",
        },
      ],
    })
    expect(warnings).toEqual([])
  })

  it("warns on trustScore outside [0,1]", () => {
    const warnings = validatePayload({
      snapshot: {
        timestamp: "2025-01-01T00:00:00Z",
        source: "live_api",
        agents: [
          { id: "a1", trustScore: 1.5, authorityWeight: 0.5, status: "active" },
        ],
        thresholds: { trustThreshold: 0.5, suppressionThreshold: 0.2, driftDelta: 0.1 },
        eventCount: 0,
        suppressedCount: 0,
      },
      events: [],
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0].field).toBe("trustScore")
    expect(warnings[0].agentId).toBe("a1")
  })

  it("warns on authorityWeight outside [0,1]", () => {
    const warnings = validatePayload({
      snapshot: {
        timestamp: "2025-01-01T00:00:00Z",
        source: "live_api",
        agents: [
          { id: "a1", trustScore: 0.5, authorityWeight: -0.1, status: "active" },
        ],
        thresholds: { trustThreshold: 0.5, suppressionThreshold: 0.2, driftDelta: 0.1 },
        eventCount: 0,
        suppressedCount: 0,
      },
      events: [],
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0].field).toBe("authorityWeight")
  })

  it("warns on missing agent id", () => {
    const warnings = validatePayload({
      snapshot: {
        timestamp: "2025-01-01T00:00:00Z",
        source: "live_api",
        agents: [
          { id: "", trustScore: 0.5, authorityWeight: 0.5, status: "active" },
        ],
        thresholds: { trustThreshold: 0.5, suppressionThreshold: 0.2, driftDelta: 0.1 },
        eventCount: 0,
        suppressedCount: 0,
      },
      events: [],
    })
    expect(warnings.some((w) => w.field === "id")).toBe(true)
  })

  it("warns on unparseable event timestamp", () => {
    const warnings = validatePayload({
      snapshot: {
        timestamp: "2025-01-01T00:00:00Z",
        source: "live_api",
        agents: [],
        thresholds: { trustThreshold: 0.5, suppressionThreshold: 0.2, driftDelta: 0.1 },
        eventCount: 0,
        suppressedCount: 0,
      },
      events: [
        {
          id: "e1",
          timestamp: "not-a-date",
          type: "heartbeat",
          severity: "info",
          message: "ping",
        },
      ],
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0].field).toBe("timestamp")
  })

  it("accumulates multiple warnings", () => {
    const warnings = validatePayload({
      snapshot: {
        timestamp: "2025-01-01T00:00:00Z",
        source: "live_api",
        agents: [
          { id: "a1", trustScore: 2.0, authorityWeight: -1.0, status: "active" },
          { id: "", trustScore: 0.5, authorityWeight: 0.5, status: "active" },
        ],
        thresholds: { trustThreshold: 0.5, suppressionThreshold: 0.2, driftDelta: 0.1 },
        eventCount: 0,
        suppressedCount: 0,
      },
      events: [],
    })
    // a1: trustScore OOB + authorityWeight OOB, "": missing id
    expect(warnings.length).toBeGreaterThanOrEqual(3)
  })
})
