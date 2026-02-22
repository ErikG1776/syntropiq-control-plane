import type {
  DataSourceKey,
  GovernanceMessageHandler,
  Unsubscribe,
} from "@/lib/governance/schema"

export interface GovernanceDataSource {
  key: DataSourceKey
  label: string
  mode: "replay" | "poll" | "stream"
  connect: (opts: {
    onMessage: GovernanceMessageHandler
    onStatus?: (s: { connected: boolean; message?: string }) => void
  }) => Promise<Unsubscribe>
}
