import type {
  DataSourceKey,
  GovernanceMessageHandler,
  GovernanceStreamPayload,
  Unsubscribe,
} from "@/lib/governance/schema"

type ReplayNormalizer = (json: unknown) => GovernanceStreamPayload

function safeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export async function runReplayStream(opts: {
  source: DataSourceKey
  replayPath: string
  speedMs: number
  normalize: ReplayNormalizer
  onMessage: GovernanceMessageHandler
  onStatus?: (s: { connected: boolean; message?: string }) => void
}): Promise<Unsubscribe> {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  opts.onStatus?.({ connected: false, message: "Loading replay..." })

  let replayJson: unknown = {}
  try {
    const res = await fetch(opts.replayPath, { cache: "no-store" })
    if (!res.ok) {
      opts.onStatus?.({
        connected: false,
        message: `Replay load failed (${res.status})`,
      })
      return () => void 0
    }
    replayJson = await res.json()
  } catch {
    opts.onStatus?.({ connected: false, message: "Replay load failed" })
    return () => void 0
  }

  const root =
    replayJson && typeof replayJson === "object"
      ? (replayJson as Record<string, unknown>)
      : {}
  const timeline = safeArray(root.timeline)
  const tickFrames = timeline.length > 0 ? timeline : [root]
  let idx = 0

  const emitNext = () => {
    if (stopped) return
    if (idx >= tickFrames.length) {
      opts.onStatus?.({ connected: true, message: "Replay complete" })
      return
    }

    const frame = tickFrames[idx]
    const payload = opts.normalize({
      summary: root.summary ?? {},
      runId: root.runId,
      timestamp: root.timestamp,
      frame,
      timeline: [frame],
      sequence: idx + 1,
    })

    payload.snapshot.source = opts.source
    payload.snapshot.sequence = idx + 1
    opts.onMessage(payload)
    opts.onStatus?.({
      connected: true,
      message: `Replaying ${idx + 1}/${tickFrames.length}`,
    })

    idx += 1
    timer = setTimeout(emitNext, opts.speedMs)
  }

  emitNext()

  return () => {
    stopped = true
    clearTimer()
    opts.onStatus?.({ connected: false, message: "Replay disconnected" })
  }
}
