import type { DataSourceKey } from "@/lib/governance/schema"
import type { GovernanceDataSource } from "@/lib/datasources/types"
import { resolveAdapter } from "@/lib/adapters"
import { safeNormalize } from "@/lib/datasources/normalize"
import { runReplayStream } from "@/lib/datasources/replay"
import { connectGrpc } from "@/lib/datasources/grpc"
import { connectWebSocket } from "@/lib/datasources/websocket"
import replayScenarios from "@/public/replays/scenarios/index.json"

const REPLAY_SPEED_MS = 800
const POLL_INTERVAL_MS = 2000

interface ReplayScenarioIndexEntry {
  id: string
  label: string
  description: string
  file: string
}

const replayScenarioEntries =
  replayScenarios as ReplayScenarioIndexEntry[]

const replayDataSources: Record<string, GovernanceDataSource> =
  Object.fromEntries(
    replayScenarioEntries.map((scenario) => {
      const key = `replay_${scenario.id}`
      const sourceKey = key as DataSourceKey

      return [
        key,
        {
          key,
          label: scenario.label,
          mode: "replay" as const,
          connect: (opts) =>
            runReplayStream({
              source: sourceKey,
              replayPath: scenario.file,
              speedMs: REPLAY_SPEED_MS,
              normalize: safeNormalize,
              onMessage: opts.onMessage,
              onStatus: opts.onStatus,
            }),
        } satisfies GovernanceDataSource,
      ]
    }),
  )

export const dataSources: Record<string, GovernanceDataSource> = {
  ...replayDataSources,

  live_api: {
    key: "live_api",
    label: "Live API (Poll)",
    mode: "poll",
    config: { pollIntervalMs: POLL_INTERVAL_MS },
    connect: async ({ onMessage, onStatus, config }) => {
      let stopped = false
      const pollMs = config?.pollIntervalMs ?? POLL_INTERVAL_MS
      const snapshotUrl = "/api/control-plane/snapshot"

      async function poll() {
        if (stopped) return

        try {
          const res = await fetch(snapshotUrl, { cache: "no-store" })

          if (!res.ok) {
            onStatus?.({
              connected: false,
              message: `Control-plane unavailable (${res.status})`,
            })
            return
          }

          const payload = await res.json()

          onMessage(payload)
          onStatus?.({
            connected: true,
            message: "Connected via control-plane proxy",
          })
        } catch {
          onStatus?.({
            connected: false,
            message: "Control-plane connection failed",
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

  live_grpc: {
    key: "live_grpc",
    label: "gRPC-web",
    mode: "grpc",
    connect: (opts) =>
      connectGrpc({
        onMessage: opts.onMessage,
        onStatus: opts.onStatus,
        config: opts.config,
      }),
  },

  live_ws: {
    key: "live_ws",
    label: "Live WebSocket",
    mode: "stream",
    connect: (opts) =>
      connectWebSocket({
        onMessage: opts.onMessage,
        onStatus: opts.onStatus,
        config: opts.config,
      }),
  },
}
