import type { NextRequest } from "next/server"
import { hasRole } from "@/lib/auth/rbac"
import { getActor } from "@/lib/auth/actor"

const BACKEND_BASE_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * PUT /api/control-plane/agents/status
 *
 * Proxies agent status changes (suppress / restore) to the backend.
 * Requires operator+ role. Actor attribution forwarded to backend.
 * Body: { agentId: string, status: "suppressed" | "active" }
 */
export async function PUT(request: NextRequest) {
  const bypassAuth = process.env.AUTH_DEV_BYPASS === "true"
  const actor = await getActor(request)

  if (!bypassAuth) {
    if (!actor) {
      return Response.json({ error: "unauthenticated" }, { status: 401 })
    }
    if (!hasRole(actor.role, "operator")) {
      return Response.json({ error: "forbidden" }, { status: 403 })
    }
  }

  let payload: Record<string, unknown>
  try {
    payload = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }

  const { agentId, status } = payload as { agentId?: string; status?: string }

  if (!agentId || !status) {
    return Response.json(
      { error: "agentId and status are required" },
      { status: 400 },
    )
  }

  if (status !== "suppressed" && status !== "active") {
    return Response.json(
      { error: "status must be 'suppressed' or 'active'" },
      { status: 400 },
    )
  }

  try {
    const forwardBody: Record<string, unknown> = { agentId, status }
    if (actor) forwardBody.actor = actor

    const backendUrl = `${BACKEND_BASE_URL}/api/v1/agents/${encodeURIComponent(agentId)}/status?status=${encodeURIComponent(status)}`

    const upstream = await fetch(backendUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forwardBody),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })

    const upstreamBody = await upstream.json().catch(() => ({}))
    return Response.json(upstreamBody, { status: upstream.status })
  } catch {
    return Response.json({ error: "backend_unreachable" }, { status: 502 })
  }
}
