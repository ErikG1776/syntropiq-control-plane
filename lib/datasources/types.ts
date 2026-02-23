import type {
  GovernanceMessageHandler,
  GovernanceStreamPayload,
  Unsubscribe,
} from "@/lib/governance/schema"

// ---------------------------------------------------------------------------
// Status reporting
// ---------------------------------------------------------------------------

export interface DataSourceStatus {
  connected: boolean
  message?: string
}

export type StatusHandler = (s: DataSourceStatus) => void

// ---------------------------------------------------------------------------
// Connection configuration
// ---------------------------------------------------------------------------

export interface ReconnectConfig {
  initialMs: number
  maxMs: number
  multiplier: number
}

export interface DataSourceConfig {
  /** Endpoint URL (REST, WebSocket, or SSE). */
  url?: string
  /** Polling interval in milliseconds (poll mode only). */
  pollIntervalMs?: number
  /** Reconnect policy (stream/SSE modes). */
  reconnect?: ReconnectConfig
  /** Heartbeat timeout in milliseconds — triggers reconnect if no message. */
  heartbeatTimeoutMs?: number
  /** Auth configuration. */
  auth?: {
    type: "bearer" | "apikey" | "none"
    /** Token value or env var name. */
    token?: string
  }
  /** gRPC-web endpoint URL. */
  grpcEndpointUrl?: string
  /** Fully-qualified service identifier (placeholder). */
  grpcService?: string
  /** Method name (placeholder). */
  grpcMethod?: string
  /** Fallback mode when a stream descriptor is unavailable. */
  grpcUseUnaryPolling?: boolean
}

// ---------------------------------------------------------------------------
// Datasource interface
// ---------------------------------------------------------------------------

export interface GovernanceDataSource {
  key: string
  label: string
  mode: "replay" | "poll" | "stream" | "grpc"
  /** Optional default config for this source.  Overridable at connect time. */
  config?: DataSourceConfig
  connect: (opts: {
    onMessage: GovernanceMessageHandler
    onStatus?: StatusHandler
    config?: DataSourceConfig
  }) => Promise<Unsubscribe>
}

// ---------------------------------------------------------------------------
// Normalizer type
// ---------------------------------------------------------------------------

export type PayloadNormalizer = (json: unknown) => GovernanceStreamPayload
