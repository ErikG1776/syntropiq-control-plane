import type { DataSourceKey } from "@/lib/governance/schema"
import type { GovernanceDataSource } from "@/lib/datasources/types"
import {
  normalizeFinance,
  normalizeGovernanceDemo,
  normalizeInfraChain,
  normalizeReadmission,
  safeNormalize,
} from "@/lib/datasources/normalize"
import { runReplayStream } from "@/lib/datasources/replay"
import { connectWebSocket } from "@/lib/datasources/websocket"
import { connectGrpcWeb } from "@/lib/datasources/grpc-web/client"

const REPLAY_SPEED_MS = 800
const POLL_INTERVAL_MS = 2000

export const dataSources: Record<DataSourceKey, GovernanceDataSource> = {
  replay_infra_chain: {
    key: "replay_infra_chain",
    label: "Infra Chain Replay",
    mode: "replay",
    connect: (opts) =>
      runReplayStream({
        source: "replay_infra_chain",
        replayPath: "/replays/replay_infra_chain.json",
        speedMs: REPLAY_SPEED_MS,
        normalize: normalizeInfraChain,
        onMessage: opts.onMessage,
        onStatus: opts.onStatus,
      }),
  },
  replay_readmission: {
    key: "replay_readmission",
    label: "Readmission Replay",
    mode: "replay",
    connect: (opts) =>
      runReplayStream({
        source: "replay_readmission",
        replayPath: "/replays/replay_readmission.json",
        speedMs: REPLAY_SPEED_MS,
        normalize: normalizeReadmission,
        onMessage: opts.onMessage,
        onStatus: opts.onStatus,
      }),
  },
  replay_finance: {
    key: "replay_finance",
    label: "Finance Replay",
    mode: "replay",
    connect: (opts) =>
      runReplayStream({
        source: "replay_finance",
        replayPath: "/replays/replay_finance.json",
        speedMs: REPLAY_SPEED_MS,
        normalize: normalizeFinance,
        onMessage: opts.onMessage,
        onStatus: opts.onStatus,
      }),
  },
  replay_governance_demo: {
    key: "replay_governance_demo",
    label: "Governance Demo",
    mode: "replay",
    connect: (opts) =>
      runReplayStream({
        source: "replay_governance_demo",
        replayPath: "/replays/replay_governance_demo.json",
        speedMs: REPLAY_SPEED_MS,
        normalize: normalizeGovernanceDemo,
        onMessage: opts.onMessage,
        onStatus: opts.onStatus,
      }),
  },
  live_api: {
    key: "live_api",
    label: "Live API (Poll)",
    mode: "poll",
    config: { pollIntervalMs: POLL_INTERVAL_MS },
    connect: async ({ onMessage, onStatus, config }) => {
      let stopped = false
      const pollMs = config?.pollIntervalMs ?? POLL_INTERVAL_MS
      const url = config?.url ?? "/api/control-plane/snapshot"

      async function poll() {
        if (stopped) return

        try {
          const headers: Record<string, string> = {}
          if (config?.auth?.type === "bearer" && config.auth.token) {
            headers["Authorization"] = `Bearer ${config.auth.token}`
          } else if (config?.auth?.type === "apikey" && config.auth.token) {
            headers["X-Api-Key"] = config.auth.token
          }

          const res = await fetch(url, {
            cache: "no-store",
            headers,
          })

          if (!res.ok) {
            onStatus?.({
              connected: false,
              message: `Backend unavailable (${res.status})`,
            })
            return
          }

          const json = await res.json()

          // If polling a direct backend (not our proxy route), normalize
          const payload =
            json?.snapshot && typeof json.snapshot === "object"
              ? json
              : safeNormalize(json, "live_api")

          onMessage(payload)
          onStatus?.({
            connected: true,
            message: "Connected to Syntropiq backend",
          })
        } catch {
          onStatus?.({
            connected: false,
            message: "Backend connection failed",
          })
        }
      }

      await poll()
      const interval = setInterval(poll, pollMs)

      return () => {
        stopped = true
        clearInterval(interval)
        onStatus?.({ connected: false, message: "Disconnected" })
      }
    },
  },
  live_ws: {
    key: "live_ws",
    label: "Live WebSocket",
    mode: "stream",
    config: {
      heartbeatTimeoutMs: 15000,
      reconnect: { initialMs: 1000, maxMs: 30000, multiplier: 2 },
    },
    connect: (opts) =>
      connectWebSocket({
        onMessage: opts.onMessage,
        onStatus: opts.onStatus,
        config: opts.config,
      }),
  },
  live_sse: {
    key: "live_sse",
    label: "Live SSE",
    mode: "stream",
    config: { url: "/api/control-plane/events/stream" },
    connect: async ({ onMessage, onStatus, config }) => {
      let stopped = false
      let eventSource: EventSource | null = null
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null
      let reconnectMs = 1000

      function clearTimer() {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
      }

      function connect() {
        if (stopped) return
        const url = config?.url ?? "/api/control-plane/events/stream"
        onStatus?.({ connected: false, message: `Connecting SSE to ${url}...` })

        eventSource = new EventSource(url)

        eventSource.onopen = () => {
          if (stopped) { eventSource?.close(); return }
          reconnectMs = 1000
          onStatus?.({ connected: true, message: "SSE connected" })
        }

        eventSource.onmessage = (event) => {
          if (stopped) return
          try {
            const data = JSON.parse(event.data)
            const payload = safeNormalize(data, "live_sse")
            onMessage(payload)
          } catch {
            // skip unparseable frames
          }
        }

        eventSource.onerror = () => {
          if (stopped) return
          eventSource?.close()
          onStatus?.({
            connected: false,
            message: `SSE error — reconnecting in ${Math.round(reconnectMs / 1000)}s`,
          })
          clearTimer()
          reconnectTimer = setTimeout(() => {
            reconnectMs = Math.min(reconnectMs * 2, 30000)
            connect()
          }, reconnectMs)
        }
      }

      connect()

      return () => {
        stopped = true
        clearTimer()
        eventSource?.close()
        eventSource = null
        onStatus?.({ connected: false, message: "SSE disconnected" })
      }
    },
  },
  live_grpc: {
    key: "live_grpc",
    label: "Live gRPC-web",
    mode: "stream",
    config: {
      url: process.env.NEXT_PUBLIC_GRPC_URL ?? "http://localhost:8080",
      reconnect: { initialMs: 1000, maxMs: 30000, multiplier: 2 },
    },
    connect: (opts) =>
      connectGrpcWeb({
        onMessage: opts.onMessage,
        onStatus: opts.onStatus,
        config: opts.config,
      }),
  },
  live_events_stream: {
    key: "live_events_stream",
    label: "Live Events Stream",
    mode: "stream",
    config: {
      url: "/api/control-plane/events/stream",
    },
    connect: async ({ onMessage, onStatus }) => {
      let stopped = false
      const es = new EventSource("/api/control-plane/events/stream")

      es.onopen = () => {
        onStatus?.({ connected: true, message: "Events stream connected" })
      }

      es.onmessage = (event) => {
        if (stopped) return
        try {
          const data = JSON.parse(event.data)
          onMessage(data)
        } catch {
          // ignore malformed frames
        }
      }

      es.onerror = () => {
        if (stopped) return
        onStatus?.({ connected: false, message: "Events stream error" })
      }

      return () => {
        stopped = true
        es.close()
        onStatus?.({ connected: false, message: "Events stream disconnected" })
      }
    },
  },
}
