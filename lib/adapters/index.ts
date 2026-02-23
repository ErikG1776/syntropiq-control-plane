import type { GovernanceAdapter } from "@/lib/adapters/types"
import { replayAdapter } from "@/lib/adapters/replay-adapter"
import { syntropiqPythonAdapter } from "@/lib/adapters/syntropiq-python-adapter"
import { genericSnapshotAdapter } from "@/lib/adapters/generic-snapshot-adapter"

const adapters: GovernanceAdapter[] = [
  replayAdapter,
  syntropiqPythonAdapter,
  genericSnapshotAdapter,
]

export function resolveAdapter(payload: unknown): GovernanceAdapter {
  for (const adapter of adapters) {
    if (adapter.canHandle(payload)) return adapter
  }
  return genericSnapshotAdapter
}
