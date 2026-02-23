/** Schema version — bump when breaking changes are made to canonical types. */
export const SCHEMA_VERSION = "0.2.0"

/** Runtime status of a governed agent. */
export type AgentStatus = "active" | "probation" | "suppressed" | "unknown"

/**
 * System-wide governance thresholds.
 *
 * A value of `-1` is used as a sentinel when the backend does not provide a
 * threshold.  UI components should render "—" (em-dash) for sentinel values.
 */
export interface GovernanceThresholds {
  trustThreshold: number
  suppressionThreshold: number
  driftDelta: number
}

/**
 * Canonical state of a single governed agent at a point in time.
 *
 * **authorityWeight contract:** If the backend does not provide
 * `authorityWeight`, all normalizers proxy it from `trustScore`.  An agent
 * with no declared authority is treated as "self-governing" — its influence
 * is proportional to its trustworthiness.
 */
export interface AgentState {
  id: string
  /** Trust score in the range [0, 1]. */
  trustScore: number
  /** Authority weight in the range [0, 1].  See contract note above. */
  authorityWeight: number
  status: AgentStatus
  capabilities?: string[]
  labels?: Record<string, string>
  lastDecisionAt?: string
}

export type GovernanceEventType =
  | "trust_update"
  | "suppression"
  | "probation"
  | "mutation"
  | "routing_freeze"
  | "system_alert"
  | "status_change"
  | "threshold_breach"
  | "heartbeat"

export interface GovernanceEvent {
  id: string
  timestamp: string
  type: GovernanceEventType
  severity: "info" | "warn" | "error" | "critical"
  message: string
  agentId?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export type DataSourceKey =
  | "replay_infra_chain"
  | "replay_readmission"
  | "replay_finance"
  | "replay_governance_demo"
  | "live_api"
  | "live_ws"
  | "live_sse"

/**
 * Canonical snapshot of the governed system at a point in time.
 *
 * **Stability metric:** Computed by the store as the normalized weighted mean
 * of agent trust scores:
 *
 *     stability = Σ(trustScore × authorityWeight) / Σ(authorityWeight)
 *
 * Bounded [0, 1].  Zero when no agents have positive authority.
 */
export interface GovernanceSnapshot {
  timestamp: string
  source: DataSourceKey
  runId?: string
  sequence?: number
  healthy?: boolean
  agents: AgentState[]
  thresholds: GovernanceThresholds
  eventCount: number
  suppressedCount: number
}

export interface GovernanceStreamPayload {
  snapshot: GovernanceSnapshot
  events: GovernanceEvent[]
}

export type Unsubscribe = () => void
export type GovernanceMessageHandler = (payload: GovernanceStreamPayload) => void
