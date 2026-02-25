import { NextResponse, type NextRequest } from "next/server"

const BACKEND_BASE_URL = process.env.BACKEND_URL || "http://localhost:8000"

/**
 * PUT /api/control-plane/agents/status
 *
 * Proxies agent status changes (suppress / restore) to the backend.
 * Body: { agentId: string, status: "suppressed" | "active" }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { agentId, status } = body as { agentId?: string; status?: string }

    if (!agentId || !status) {
      return NextResponse.json(
        { error: "agentId and status are required" },
        { status: 400 },
      )
    }

    if (status !== "suppressed" && status !== "active") {
      return NextResponse.json(
        { error: "status must be 'suppressed' or 'active'" },
        { status: 400 },
      )
    }

    const backendUrl = `${BACKEND_BASE_URL}/api/v1/agents/${encodeURIComponent(agentId)}/status?status=${encodeURIComponent(status)}`

    const res = await fetch(backendUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "Backend error")
      return NextResponse.json(
        { error: text },
        { status: res.status },
      )
    }

    const data = await res.json().catch(() => ({ ok: true }))
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update agent status" },
      { status: 502 },
    )
  }
}
