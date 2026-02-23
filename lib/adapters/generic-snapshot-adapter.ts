import { normalizePayload } from "@/lib/datasources/normalize"
import type { GovernanceAdapter } from "@/lib/adapters/types"

export const genericSnapshotAdapter: GovernanceAdapter = {
  id: "generic-snapshot-adapter",
  canHandle(): boolean {
    return true
  },
  normalize(payload: unknown) {
    return normalizePayload(payload, "live_api")
  },
}
