/**
 * SSE proxy route: proxies the backend event stream to the browser.
 *
 * Backend endpoint: GET {BACKEND_URL}/api/v1/events/stream
 * Protocol: Server-Sent Events (text/event-stream)
 *
 * Each backend SSE message is normalized to the canonical
 * GovernanceStreamPayload schema before forwarding.
 */

import { normalizePayload } from "@/lib/datasources/normalize"

const BACKEND_BASE_URL = process.env.BACKEND_URL || "http://localhost:8000"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: Request) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const abortController = new AbortController()

      // Close stream when client disconnects
      request.signal.addEventListener("abort", () => {
        abortController.abort()
        controller.close()
      })

      try {
        const response = await fetch(
          `${BACKEND_BASE_URL}/api/v1/events/stream`,
          {
            cache: "no-store",
            signal: abortController.signal,
            headers: { Accept: "text/event-stream" },
          },
        )

        if (!response.ok || !response.body) {
          // Send an error event then close
          const errorPayload = JSON.stringify({
            snapshot: {
              timestamp: new Date().toISOString(),
              source: "live_sse",
              agents: [],
              thresholds: { trustThreshold: 0, suppressionThreshold: 0, driftDelta: 0 },
              eventCount: 0,
              suppressedCount: 0,
              healthy: false,
            },
            events: [],
          })
          controller.enqueue(
            encoder.encode(`data: ${errorPayload}\n\n`),
          )
          controller.close()
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Process complete SSE messages (delimited by \n\n)
          const messages = buffer.split("\n\n")
          // Keep the last incomplete chunk in buffer
          buffer = messages.pop() ?? ""

          for (const msg of messages) {
            if (!msg.trim()) continue

            // Extract data from SSE format: "data: {...}"
            const dataLine = msg
              .split("\n")
              .find((line) => line.startsWith("data:"))
            if (!dataLine) continue

            const jsonStr = dataLine.slice(5).trim()
            if (!jsonStr) continue

            try {
              const raw = JSON.parse(jsonStr)
              // Normalize through the unified pipeline
              const payload = normalizePayload(raw, "live_sse")
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
              )
            } catch {
              // Forward raw if we can't normalize — let the client handle it
              controller.enqueue(encoder.encode(`data: ${jsonStr}\n\n`))
            }
          }
        }

        controller.close()
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const errorPayload = JSON.stringify({
            snapshot: {
              timestamp: new Date().toISOString(),
              source: "live_sse",
              agents: [],
              thresholds: { trustThreshold: 0, suppressionThreshold: 0, driftDelta: 0 },
              eventCount: 0,
              suppressedCount: 0,
              healthy: false,
            },
            events: [
              {
                id: `evt_sse_error_${Date.now()}`,
                timestamp: new Date().toISOString(),
                type: "system_alert",
                severity: "error",
                message: `SSE proxy error: ${(err as Error).message ?? "unknown"}`,
                tags: ["sse", "proxy"],
              },
            ],
          })
          try {
            controller.enqueue(
              encoder.encode(`data: ${errorPayload}\n\n`),
            )
          } catch { /* stream may already be closed */ }
        }
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
