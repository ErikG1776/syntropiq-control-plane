import { describe, it, expect } from "vitest"
import { SCHEMA_VERSION } from "@/lib/governance/schema"
import type {
  AgentStatus,
  AgentState,
  GovernanceEvent,
  GovernanceEventType,
  GovernanceSnapshot,
  GovernanceStreamPayload,
  GovernanceThresholds,
  DataSourceKey,
} from "@/lib/governance/schema"

describe("schema", () => {
  it("exports a valid semver SCHEMA_VERSION", () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("SCHEMA_VERSION is currently 0.2.0", () => {
    expect(SCHEMA_VERSION).toBe("0.2.0")
  })
})

describe("schema types compile correctly", () => {
  it("AgentStatus union covers all values", () => {
    const statuses: AgentStatus[] = ["active", "probation", "suppressed", "unknown"]
    expect(statuses).toHaveLength(4)
  })

  it("GovernanceEventType union covers all values", () => {
    const types: GovernanceEventType[] = [
      "trust_update",
      "suppression",
      "probation",
      "mutation",
      "routing_freeze",
      "system_alert",
      "status_change",
      "threshold_breach",
      "heartbeat",
    ]
    expect(types).toHaveLength(9)
  })

  it("DataSourceKey union covers all values", () => {
    const keys: DataSourceKey[] = [
      "replay_infra_chain",
      "replay_readmission",
      "replay_finance",
      "replay_governance_demo",
      "live_api",
      "live_ws",
      "live_sse",
    ]
    expect(keys).toHaveLength(7)
  })

  it("GovernanceThresholds has required numeric fields", () => {
    const t: GovernanceThresholds = {
      trustThreshold: 0.5,
      suppressionThreshold: 0.2,
      driftDelta: 0.1,
    }
    expect(typeof t.trustThreshold).toBe("number")
    expect(typeof t.suppressionThreshold).toBe("number")
    expect(typeof t.driftDelta).toBe("number")
  })

  it("AgentState can be constructed with optional fields", () => {
    const agent: AgentState = {
      id: "test",
      trustScore: 0.5,
      authorityWeight: 0.5,
      status: "active",
    }
    expect(agent.capabilities).toBeUndefined()
    expect(agent.labels).toBeUndefined()
    expect(agent.lastDecisionAt).toBeUndefined()
  })

  it("AgentState accepts optional fields", () => {
    const agent: AgentState = {
      id: "test",
      trustScore: 0.5,
      authorityWeight: 0.5,
      status: "active",
      capabilities: ["plan"],
      labels: { env: "prod" },
      lastDecisionAt: "2025-01-01T00:00:00Z",
    }
    expect(agent.capabilities).toEqual(["plan"])
    expect(agent.labels).toEqual({ env: "prod" })
  })

  it("GovernanceEvent can be constructed", () => {
    const evt: GovernanceEvent = {
      id: "e1",
      timestamp: "2025-01-01T00:00:00Z",
      type: "trust_update",
      severity: "info",
      message: "test",
    }
    expect(evt.agentId).toBeUndefined()
    expect(evt.tags).toBeUndefined()
  })

  it("GovernanceSnapshot requires all mandatory fields", () => {
    const snap: GovernanceSnapshot = {
      timestamp: "2025-01-01T00:00:00Z",
      source: "live_api",
      agents: [],
      thresholds: { trustThreshold: 0, suppressionThreshold: 0, driftDelta: 0 },
      eventCount: 0,
      suppressedCount: 0,
    }
    expect(snap.runId).toBeUndefined()
    expect(snap.sequence).toBeUndefined()
    expect(snap.healthy).toBeUndefined()
  })

  it("GovernanceStreamPayload bundles snapshot + events", () => {
    const payload: GovernanceStreamPayload = {
      snapshot: {
        timestamp: "2025-01-01T00:00:00Z",
        source: "replay_finance",
        agents: [],
        thresholds: { trustThreshold: 0, suppressionThreshold: 0, driftDelta: 0 },
        eventCount: 0,
        suppressedCount: 0,
      },
      events: [],
    }
    expect(payload.snapshot).toBeDefined()
    expect(payload.events).toBeDefined()
  })
})
