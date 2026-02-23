import { normalizePayload } from "@/lib/datasources/normalize"
import type { GovernanceAdapter } from "@/lib/adapters/types"

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

export const syntropiqPythonAdapter: GovernanceAdapter = {
  id: "syntropiq-python-adapter",
  canHandle(payload: unknown): boolean {
    const root = asRecord(payload)
    const statistics = asRecord(root.statistics)
    return Array.isArray(root.agents) && Object.keys(statistics).length > 0
  },
  normalize(payload: unknown) {
    return normalizePayload(payload, "live_api")
  },
}
