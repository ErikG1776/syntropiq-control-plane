/**
 * gRPC-web transport client for Syntropiq Governance Service.
 *
 * Implements the gRPC-web wire protocol (application/grpc-web+proto)
 * for server-streaming RPCs over HTTP/1.1. Uses the existing
 * normalization pipeline for payload conversion.
 *
 * The gRPC-web specification:
 *   - Request: 5-byte frame header (compressed flag + 4-byte length) + body
 *   - Response: same framing, with optional trailers frame
 *   - Content-Type: application/grpc-web+proto or application/grpc-web-text+proto
 *
 * For JSON mode (when backend supports grpc-web-text with JSON encoding),
 * the client falls back to text-encoded frames with JSON payloads, which
 * pass through normalizePayload() like all other transports.
 */

import type {
  GovernanceMessageHandler,
  GovernanceStreamPayload,
  Unsubscribe,
} from "@/lib/governance/schema"
import type { DataSourceConfig, StatusHandler } from "@/lib/datasources/types"
import { safeNormalize } from "@/lib/datasources/normalize"
import { createComponentLogger } from "@/lib/logger"

const grpcLogger = createComponentLogger("grpc-web")

const DEFAULT_GRPC_URL = "http://localhost:8080"
const DEFAULT_SERVICE_PATH = "/syntropiq.governance.v1.GovernanceService/Subscribe"

interface GrpcWebOptions {
  onMessage: GovernanceMessageHandler
  onStatus?: StatusHandler
  config?: DataSourceConfig
}

/**
 * Decode a gRPC-web frame from a Uint8Array.
 * Frame format: [compressed: 1 byte] [length: 4 bytes big-endian] [payload: N bytes]
 * Returns { isTrailer, data, bytesConsumed } or null if not enough data.
 */
function decodeFrame(buffer: Uint8Array): {
  isTrailer: boolean
  data: Uint8Array
  bytesConsumed: number
} | null {
  if (buffer.length < 5) return null

  const compressed = buffer[0]
  const isTrailer = (compressed & 0x80) !== 0
  const length = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(1, false)

  if (buffer.length < 5 + length) return null

  return {
    isTrailer,
    data: buffer.slice(5, 5 + length),
    bytesConsumed: 5 + length,
  }
}

/**
 * Encode a gRPC-web request frame (for the empty SubscribeRequest).
 */
function encodeFrame(data: Uint8Array): Uint8Array {
  const frame = new Uint8Array(5 + data.length)
  frame[0] = 0 // not compressed, not trailer
  new DataView(frame.buffer).setUint32(1, data.length, false)
  frame.set(data, 5)
  return frame
}

/**
 * Connect to the governance service via gRPC-web server-streaming.
 */
export async function connectGrpcWeb(opts: GrpcWebOptions): Promise<Unsubscribe> {
  let stopped = false
  let abortController = new AbortController()
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectMs = 1000

  const baseUrl = opts.config?.url ?? DEFAULT_GRPC_URL
  const url = `${baseUrl.replace(/\/$/, "")}${DEFAULT_SERVICE_PATH}`
  const reconnectCfg = opts.config?.reconnect ?? { initialMs: 1000, maxMs: 30000, multiplier: 2 }

  function clearTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  async function connect() {
    if (stopped) return

    abortController = new AbortController()
    opts.onStatus?.({ connected: false, message: `Connecting gRPC-web to ${baseUrl}...` })
    grpcLogger.info("Connecting gRPC-web", { url })

    try {
      // Send empty SubscribeRequest
      const emptyRequest = encodeFrame(new Uint8Array(0))

      const headers: Record<string, string> = {
        "Content-Type": "application/grpc-web+proto",
        "X-Grpc-Web": "1",
        Accept: "application/grpc-web+proto",
      }

      if (opts.config?.auth?.type === "bearer" && opts.config.auth.token) {
        headers["Authorization"] = `Bearer ${opts.config.auth.token}`
      } else if (opts.config?.auth?.type === "apikey" && opts.config.auth.token) {
        headers["X-Api-Key"] = opts.config.auth.token
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: emptyRequest.buffer.slice(
          emptyRequest.byteOffset,
          emptyRequest.byteOffset + emptyRequest.byteLength,
        ) as ArrayBuffer,
        signal: abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`gRPC-web server returned ${response.status}`)
      }

      if (!response.body) {
        throw new Error("No response body (streaming not supported)")
      }

      reconnectMs = reconnectCfg.initialMs
      opts.onStatus?.({ connected: true, message: "gRPC-web connected" })
      grpcLogger.info("gRPC-web connected", { url })

      const reader = response.body.getReader()
      let buffer = new Uint8Array(0)

      while (!stopped) {
        const { done, value } = await reader.read()
        if (done) break

        // Append to buffer
        const newBuffer = new Uint8Array(buffer.length + value.length)
        newBuffer.set(buffer)
        newBuffer.set(value, buffer.length)
        buffer = newBuffer

        // Extract complete frames
        while (buffer.length >= 5) {
          const frame = decodeFrame(buffer)
          if (!frame) break

          buffer = buffer.slice(frame.bytesConsumed)

          if (frame.isTrailer) {
            // Trailer frame — stream complete
            grpcLogger.info("gRPC-web stream ended (trailer)")
            break
          }

          // Decode payload — try JSON first, then raw proto
          try {
            const text = new TextDecoder().decode(frame.data)
            const json = JSON.parse(text)
            const payload = safeNormalize(json, "live_grpc")
            opts.onMessage(payload)
          } catch {
            // Binary proto — attempt to extract JSON from the payload
            // This handles the case where the server sends JSON-encoded proto
            try {
              const text = new TextDecoder().decode(frame.data)
              // Try to find JSON object boundaries
              const start = text.indexOf("{")
              const end = text.lastIndexOf("}")
              if (start >= 0 && end > start) {
                const json = JSON.parse(text.substring(start, end + 1))
                const payload = safeNormalize(json, "live_grpc")
                opts.onMessage(payload)
              }
            } catch {
              grpcLogger.warn("Unparseable gRPC-web frame", {
                size: frame.data.length,
              })
            }
          }
        }
      }

      if (!stopped) {
        // Stream ended cleanly — reconnect
        opts.onStatus?.({ connected: false, message: "gRPC-web stream ended, reconnecting..." })
        scheduleReconnect()
      }
    } catch (err) {
      if (stopped) return
      const msg = err instanceof Error ? err.message : "gRPC-web error"
      grpcLogger.error("gRPC-web connection failed", { error: msg })
      opts.onStatus?.({
        connected: false,
        message: `gRPC-web error — reconnecting in ${Math.round(reconnectMs / 1000)}s`,
      })
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (stopped) return
    clearTimer()
    reconnectTimer = setTimeout(() => {
      reconnectMs = Math.min(reconnectMs * reconnectCfg.multiplier, reconnectCfg.maxMs)
      connect()
    }, reconnectMs)
  }

  connect()

  return () => {
    stopped = true
    clearTimer()
    abortController.abort()
    opts.onStatus?.({ connected: false, message: "gRPC-web disconnected" })
    grpcLogger.info("gRPC-web disconnected")
  }
}
