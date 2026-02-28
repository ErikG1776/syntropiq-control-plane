import type { NextRequest } from "next/server"
import { hasRole } from "@/lib/auth/rbac"
import { getActor } from "@/lib/auth/actor"

const BACKEND_BASE_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(request: NextRequest) {
  const bypassAuth = process.env.AUTH_DEV_BYPASS === "true"
  const actor = await getActor(request)
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID()

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

    const upstream = await fetch(`${BACKEND_BASE_URL}/api/v1/governance/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify(forwardBody),
      cache: "no-store",
    })

    const upstreamBody = await upstream.json().catch(() => ({}))
    const responseRequestId = upstream.headers?.get?.("x-request-id") ?? requestId
    return Response.json(upstreamBody, {
      status: upstream.status,
      headers: {
        "x-request-id": responseRequestId,
      },
    })
  } catch {
    return Response.json(
      { error: "backend_unreachable" },
      {
        status: 502,
        headers: { "x-request-id": requestId },
      },
    )
  }
}
