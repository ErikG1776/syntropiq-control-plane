import type { DataSourceKey } from "@/lib/governance/schema"
import type { GovernanceDataSource } from "@/lib/datasources/types"
import {
  normalizeFinance,
  normalizeFraudReplay,
  normalizeInfraChain,
  normalizeReadmission,
} from "@/lib/datasources/normalize"
import { runReplayStream } from "@/lib/datasources/replay"
import { connectEventsSse } from "@/lib/datasources/sse"
import { connectWebSocket } from "@/lib/datasources/websocket"

const speedMs = 800

export const dataSources: Record<DataSourceKey, GovernanceDataSource> = {
  replay_infra_chain: {
    key: "replay_infra_chain",
    label: "Infra Chain Replay",
    mode: "replay",
    connect: (opts) =>
      runReplayStream({
        source: "replay_infra_chain",
        replayPath: "/replays/replay_infra_chain.json",
        speedMs,
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
        speedMs,
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
        speedMs,
        normalize: normalizeFinance,
        onMessage: opts.onMessage,
        onStatus: opts.onStatus,
      }),
  },

  replay_fraud: {
    key: "replay_fraud",
    label: "Fraud Governance Replay",
    mode: "replay",
    connect: (opts) =>
      runReplayStream({
        source: "replay_fraud",
        replayPath: "/replays/replay_fraud.json",
        speedMs,
        normalize: normalizeFraudReplay,
        onMessage: opts.onMessage,
        onStatus: opts.onStatus,
      }),
  },

  live_api: {
    key: "live_api",
    label: "Live API (Poll)",
    mode: "poll",
    connect: async ({ onMessage, onStatus }) => {
      let stopped = false
      const pollMs = 2000

      async function poll() {
        if (stopped) return

        try {
          const res = await fetch("/api/control-plane/snapshot", {
            cache: "no-store",
          })

          if (!res.ok) {
            onStatus?.({
              connected: false,
              message: `Backend unavailable (${res.status})`,
            })
            return
          }

          const json = await res.json()
          onMessage(json)

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
        onStatus?.({
          connected: false,
          message: "Disconnected",
        })
      }
    },
  },

  live_ws: {
    key: "live_ws",
    label: "Live WebSocket",
    mode: "stream",
    connect: (opts) =>
      connectWebSocket({
        onMessage: opts.onMessage,
        onStatus: opts.onStatus,
      }),
  },

  live_events_stream: {
    key: "live_events_stream",
    label: "Live Governance Events (SSE)",
    mode: "stream",
    connect: (opts) =>
      connectEventsSse({
        onMessage: opts.onMessage,
        onStatus: opts.onStatus,
      }),
  },
}
