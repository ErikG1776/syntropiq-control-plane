import type {
  GovernanceMessageHandler,
  GovernanceStreamPayload,
  Unsubscribe,
} from "@/lib/governance/schema"
import type { DataSourceConfig, StatusHandler } from "@/lib/datasources/types"
import { safeNormalize, validatePayload } from "@/lib/datasources/normalize"

const DEFAULT_WS_URL = "ws://localhost:8000/ws/governance"
const DEFAULT_INITIAL_RECONNECT_MS = 1000
const DEFAULT_MAX_RECONNECT_MS = 30000
const DEFAULT_RECONNECT_MULTIPLIER = 2
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 15000

function resolveWsUrl(config?: DataSourceConfig): string {
  if (config?.url) return config.url
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("syntropiq_ws_url")
    if (stored) return stored
  }
  return process.env.NEXT_PUBLIC_WS_URL || DEFAULT_WS_URL
}

function isPlausiblePayload(data: unknown): boolean {
  if (!data || typeof data !== "object") return false
  const obj = data as Record<string, unknown>
  // Accept either canonical { snapshot, events } or raw backend shapes
  return (
    (obj.snapshot !== undefined && typeof obj.snapshot === "object") ||
    (Array.isArray(obj.agents)) ||
    (obj.frame !== undefined && typeof obj.frame === "object")
  )
}

export async function connectWebSocket(opts: {
  onMessage: GovernanceMessageHandler
  onStatus?: StatusHandler
  config?: DataSourceConfig
}): Promise<Unsubscribe> {
  const reconnectCfg = opts.config?.reconnect ?? {
    initialMs: DEFAULT_INITIAL_RECONNECT_MS,
    maxMs: DEFAULT_MAX_RECONNECT_MS,
    multiplier: DEFAULT_RECONNECT_MULTIPLIER,
  }
  const heartbeatMs = opts.config?.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS

  let stopped = false
  let ws: WebSocket | null = null
  let reconnectMs = reconnectCfg.initialMs
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null

  // --- Health metrics ---
  let _messagesReceived = 0
  let _validationWarnings = 0
  let _droppedFrames = 0

  function clearTimers() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function resetHeartbeat() {
    if (heartbeatTimer) clearTimeout(heartbeatTimer)
    heartbeatTimer = setTimeout(() => {
      opts.onStatus?.({
        connected: false,
        message: "Heartbeat timeout — no message received",
      })
      if (ws) {
        try { ws.close() } catch { /* noop */ }
      }
    }, heartbeatMs)
  }

  function connect() {
    if (stopped) return

    const url = resolveWsUrl(opts.config)
    opts.onStatus?.({ connected: false, message: `Connecting to ${url}...` })

    try {
      ws = new WebSocket(url)
    } catch {
      opts.onStatus?.({
        connected: false,
        message: "WebSocket construction failed — endpoint may not exist",
      })
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      if (stopped) { ws?.close(); return }
      reconnectMs = reconnectCfg.initialMs
      opts.onStatus?.({ connected: true, message: "WebSocket connected" })
      resetHeartbeat()
    }

    ws.onmessage = (event) => {
      if (stopped) return
      resetHeartbeat()

      try {
        const data = JSON.parse(event.data)
        if (isPlausiblePayload(data)) {
          // Normalize through the unified pipeline — no source-tagging hack
          const payload: GovernanceStreamPayload = safeNormalize(data, "live_ws")
          _messagesReceived += 1

          const warnings = validatePayload(payload)
          if (warnings.length > 0) {
            _validationWarnings += warnings.length
          }

          opts.onMessage(payload)
        } else {
          _droppedFrames += 1
        }
      } catch {
        _droppedFrames += 1
      }
    }

    ws.onerror = () => {
      opts.onStatus?.({
        connected: false,
        message: "WebSocket error",
      })
    }

    ws.onclose = () => {
      if (stopped) return
      opts.onStatus?.({
        connected: false,
        message: `Disconnected — reconnecting in ${Math.round(reconnectMs / 1000)}s`,
      })
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (stopped) return
    clearTimers()
    reconnectTimer = setTimeout(() => {
      reconnectMs = Math.min(
        reconnectMs * reconnectCfg.multiplier,
        reconnectCfg.maxMs,
      )
      connect()
    }, reconnectMs)
  }

  connect()

  return () => {
    stopped = true
    clearTimers()
    if (ws) {
      try { ws.close() } catch { /* noop */ }
      ws = null
    }
    opts.onStatus?.({ connected: false, message: "WebSocket disconnected" })
  }
}

// Export for health metrics panel (Phase 1.3)
export function getWebSocketMetrics() {
  // Placeholder — will be wired to a metrics store in Phase 1.3
  return null
}
