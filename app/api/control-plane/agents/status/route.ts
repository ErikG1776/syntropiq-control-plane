<<<<<<< HEAD
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
=======
import type { NextRequest } from "next/server"
import { hasRole } from "@/lib/auth/rbac"
import { getActor } from "@/lib/auth/actor"

const BACKEND_BASE_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000"

export const dynamic = "force-dynamic"
export const revalidate = 0

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

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }

  try {
    const forwardBody = typeof payload === "object" && payload ? payload as Record<string, unknown> : {}
    if (actor) forwardBody.actor = actor

    const upstream = await fetch(`${BACKEND_BASE_URL}/api/v1/agents/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(forwardBody),
      cache: "no-store",
    })
    const upstreamBody = await upstream.json().catch(() => ({}))
    return Response.json(upstreamBody, { status: upstream.status })
  } catch {
    return Response.json({ error: "backend_unreachable" }, { status: 502 })
>>>>>>> 1bc06fd (Phase 5B/5C: session auth + RBAC, execution mediation proxy, actor attribution UI, request-id correlation support)
  }
}
