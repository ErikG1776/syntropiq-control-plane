import type { GovernanceEvent } from "@/lib/governance/schema"

export interface BackendGovernanceEventV1 {
  run_id: string
  cycle_id: string
  timestamp: string
  type: string
  agent_id?: string | null
  trust_before: number
  trust_after: number
  authority_before: number
  authority_after: number
  metadata: Record<string, unknown>
}

export interface BackendGovernanceCycleV1 {
  run_id: string
  cycle_id: string
  timestamp: string
  total_agents: number
  successes: number
  failures: number
  trust_delta_total: number
  authority_redistribution: Record<string, number>
  events: BackendGovernanceEventV1[]
}

function toSeverity(type: string): GovernanceEvent["severity"] {
  switch (type) {
    case "suppression":
    case "threshold_breach":
      return "warn"
    case "system_alert":
      return "error"
    default:
      return "info"
  }
}

function toType(value: string): GovernanceEvent["type"] {
  switch (value) {
    case "trust_update":
    case "suppression":
    case "probation":
    case "mutation":
    case "routing_freeze":
    case "system_alert":
    case "status_change":
    case "threshold_breach":
    case "heartbeat":
    case "reflection":
      return value
    default:
      return "system_alert"
  }
}

function buildMessage(evt: BackendGovernanceEventV1): string {
  const agent = evt.agent_id ? ` for ${evt.agent_id}` : ""
  switch (evt.type) {
    case "trust_update":
      return `Trust updated${agent}: ${evt.trust_before.toFixed(3)} -> ${evt.trust_after.toFixed(3)}`
    case "suppression":
      return `Agent suppressed${agent}`
    case "mutation":
      return "Governance thresholds mutated"
    case "reflection":
      return "Reflection emitted"
    case "status_change":
      return `Agent status changed${agent}`
    default:
      return `${evt.type}${agent}`
  }
}

export function mapBackendEventToCanonical(evt: BackendGovernanceEventV1): GovernanceEvent {
  return {
    id: `${evt.cycle_id}:${evt.type}:${evt.agent_id ?? "system"}:${evt.timestamp}`,
    timestamp: evt.timestamp,
    type: toType(evt.type),
    severity: toSeverity(evt.type),
    message: buildMessage(evt),
    agentId: evt.agent_id ?? undefined,
    tags: [evt.run_id, evt.cycle_id],
    metadata: {
      runId: evt.run_id,
      cycleId: evt.cycle_id,
      trustBefore: evt.trust_before,
      trustAfter: evt.trust_after,
      authorityBefore: evt.authority_before,
      authorityAfter: evt.authority_after,
      ...evt.metadata,
    },
  }
}
