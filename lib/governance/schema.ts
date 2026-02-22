export type AgentStatus = "active" | "probation" | "suppressed" | "unknown"

export interface GovernanceThresholds {
  trustThreshold: number
  suppressionThreshold: number
  driftDelta: number
}

export interface AgentState {
  id: string
  trustScore: number
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
  | "live_api_stub"

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
