import { createConnectTransport } from "@bufbuild/connect-web"
import type { MethodInfo, ServiceType } from "@bufbuild/protobuf"
import type {
  GovernanceMessageHandler,
  GovernanceStreamPayload,
  Unsubscribe,
} from "@/lib/governance/schema"
import type { DataSourceConfig, StatusHandler } from "@/lib/datasources/types"
import { resolveAdapter } from "@/lib/adapters"
import { safeNormalize } from "@/lib/datasources/normalize"

type RuntimeMethodRegistry = Record<
  string,
  {
    service: ServiceType
    methods: Record<string, MethodInfo>
  }
>

declare global {
  interface Window {
    __syntropiqGrpcRegistry?: RuntimeMethodRegistry
  }
}

function toPlainMessage(msg: unknown): unknown {
  if (!msg || typeof msg !== "object") return msg
  const withToJson = msg as { toJson?: () => unknown }
  if (typeof withToJson.toJson === "function") {
    try {
      return withToJson.toJson()
    } catch {
      // fallback below
    }
  }
  const withToJSON = msg as { toJSON?: () => unknown }
  if (typeof withToJSON.toJSON === "function") {
    try {
      return withToJSON.toJSON()
    } catch {
      // fallback below
    }
  }
  try {
    return JSON.parse(JSON.stringify(msg))
  } catch {
    return msg
  }
}

function normalizeGrpcPayload(raw: unknown): GovernanceStreamPayload {
  try {
    const adapter = resolveAdapter(raw)
    const payload = adapter.normalize(raw)
    payload.snapshot.source = "live_grpc"
    return payload
  } catch {
    return safeNormalize(raw, "live_grpc")
  }
}

async function* singleInput(): AsyncIterable<unknown> {
  yield {}
}

export async function connectGrpc(opts: {
  onMessage: GovernanceMessageHandler
  onStatus?: StatusHandler
  config?: DataSourceConfig
}): Promise<Unsubscribe> {
  const endpoint = opts.config?.grpcEndpointUrl ?? opts.config?.url
  if (!endpoint) {
    opts.onStatus?.({
      connected: false,
      message: "gRPC-web is not configured (missing grpcEndpointUrl)",
    })
    return () => void 0
  }

  const transport = createConnectTransport({
    baseUrl: endpoint,
    useBinaryFormat: true,
  })

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const stopPolling = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  const serviceName = opts.config?.grpcService
  const methodName = opts.config?.grpcMethod

  if (opts.config?.grpcUseUnaryPolling) {
    const pollMs = opts.config?.pollIntervalMs ?? 2000
    const poll = async () => {
      if (stopped) return
      try {
        const res = await fetch(endpoint, { cache: "no-store" })
        if (!res.ok) {
          opts.onStatus?.({
            connected: false,
            message: `gRPC unary polling failed (${res.status})`,
          })
        } else {
          const json = await res.json()
          const payload = normalizeGrpcPayload(json)
          opts.onMessage(payload)
          opts.onStatus?.({ connected: true, message: "gRPC unary polling connected" })
        }
      } catch {
        opts.onStatus?.({ connected: false, message: "gRPC unary polling failed" })
      }
      timer = setTimeout(poll, pollMs)
    }
    void poll()
    return () => {
      stopped = true
      stopPolling()
      opts.onStatus?.({ connected: false, message: "gRPC disconnected" })
    }
  }

  if (!serviceName || !methodName) {
    opts.onStatus?.({
      connected: false,
      message: "gRPC-web configured, but grpcService/grpcMethod are not set",
    })
    return () => void 0
  }

  const runtimeRegistry = typeof window !== "undefined" ? window.__syntropiqGrpcRegistry : undefined
  const serviceEntry = runtimeRegistry?.[serviceName]
  const method = serviceEntry?.methods[methodName]

  if (!serviceEntry || !method) {
    opts.onStatus?.({
      connected: false,
      message: "gRPC descriptors are not available at runtime for configured service/method",
    })
    return () => void 0
  }

  const abortController = new AbortController()
  opts.onStatus?.({ connected: false, message: `Connecting gRPC-web to ${endpoint}...` })

  void (async () => {
    try {
      const response = await transport.stream(
        serviceEntry.service,
        method,
        abortController.signal,
        undefined,
        undefined,
        singleInput() as AsyncIterable<any>,
      )
      opts.onStatus?.({ connected: true, message: "gRPC-web connected" })

      for await (const msg of response.message) {
        if (stopped) break
        const payload = normalizeGrpcPayload(toPlainMessage(msg))
        opts.onMessage(payload)
      }

      if (!stopped) {
        opts.onStatus?.({ connected: false, message: "gRPC stream ended" })
      }
    } catch (err) {
      if (!stopped) {
        const message = err instanceof Error ? err.message : "gRPC stream failed"
        opts.onStatus?.({ connected: false, message })
      }
    }
  })()

  return () => {
    stopped = true
    stopPolling()
    abortController.abort()
    opts.onStatus?.({ connected: false, message: "gRPC disconnected" })
  }
}
