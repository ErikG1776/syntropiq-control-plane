import type {
  GovernanceMessageHandler,
  GovernanceStreamPayload,
  Unsubscribe,
} from "@/lib/governance/schema"

const DEFAULT_WS_URL = "ws://localhost:8000/ws/governance"
const INITIAL_RECONNECT_MS = 1000
const MAX_RECONNECT_MS = 30000
const RECONNECT_MULTIPLIER = 2
const HEARTBEAT_TIMEOUT_MS = 15000

function getWsUrl(): string {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("syntropiq_ws_url")
    if (stored) return stored
  }
  return process.env.NEXT_PUBLIC_WS_URL || DEFAULT_WS_URL
}

function isValidPayload(data: unknown): data is GovernanceStreamPayload {
  if (!data || typeof data !== "object") return false
  const obj = data as Record<string, unknown>
  return (
    obj.snapshot !== undefined &&
    typeof obj.snapshot === "object" &&
    obj.snapshot !== null &&
    Array.isArray((obj as { events?: unknown }).events)
  )
}

export async function connectWebSocket(opts: {
  onMessage: GovernanceMessageHandler
  onStatus?: (s: { connected: boolean; message?: string }) => void
}): Promise<Unsubscribe> {
  let stopped = false
  let ws: WebSocket | null = null
  let reconnectMs = INITIAL_RECONNECT_MS
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null

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
      // Force reconnect
      if (ws) {
        try { ws.close() } catch { /* noop */ }
      }
    }, HEARTBEAT_TIMEOUT_MS)
  }

  function connect() {
    if (stopped) return

    const url = getWsUrl()
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
      reconnectMs = INITIAL_RECONNECT_MS
      opts.onStatus?.({ connected: true, message: "WebSocket connected" })
      resetHeartbeat()
    }

    ws.onmessage = (event) => {
      if (stopped) return
      resetHeartbeat()

      try {
        const data = JSON.parse(event.data)
        if (isValidPayload(data)) {
          // Ensure source is tagged
          if (data.snapshot && typeof data.snapshot === "object") {
            (data.snapshot as unknown as Record<string, unknown>).source = "live_ws"
          }
          opts.onMessage(data)
        }
      } catch {
        // Silently ignore unparseable frames
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
      reconnectMs = Math.min(reconnectMs * RECONNECT_MULTIPLIER, MAX_RECONNECT_MS)
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
