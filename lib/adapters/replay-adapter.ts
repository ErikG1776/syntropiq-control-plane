import { normalizePayload } from "@/lib/datasources/normalize"
import type { GovernanceAdapter } from "@/lib/adapters/types"

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

export const replayAdapter: GovernanceAdapter = {
  id: "replay-adapter",
  canHandle(payload: unknown): boolean {
    const root = asRecord(payload)
    const timeline = root.timeline
    const summary = asRecord(root.summary)
    const frame = asRecord(root.frame)
    return (
      Array.isArray(timeline) ||
      typeof summary.frameCount === "number" ||
      Array.isArray(frame.agents) ||
      Array.isArray(frame.events)
    )
  },
  normalize(payload: unknown) {
    return normalizePayload(payload, "replay_governance_demo")
  },
}
