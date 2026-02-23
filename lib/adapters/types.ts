import type { GovernanceStreamPayload } from "@/lib/governance/schema"

export interface GovernanceAdapter {
  id: string
  canHandle(payload: unknown): boolean
  normalize(payload: unknown): GovernanceStreamPayload
}
