import type { NextRequest } from "next/server"
import { hasRole } from "@/lib/auth/rbac"
import { getServerRole } from "@/lib/auth/server"
import { getActor } from "@/lib/auth/actor"
import { createComponentLogger } from "@/lib/logger"

const log = createComponentLogger("api.thresholds")
const BACKEND_BASE_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000"

export const dynamic = "force-dynamic"
export const revalidate = 0

const VALID_KEYS = ["trustThreshold", "suppressionThreshold", "driftDelta"] as const
type ThresholdKey = (typeof VALID_KEYS)[number]

const KEY_TO_SNAKE: Record<ThresholdKey, string> = {
  trustThreshold: "trust_threshold",
  suppressionThreshold: "suppression_threshold",
  driftDelta: "drift_delta",
}

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/api/v1/thresholds`, {
      cache: "no-store",
    })
    const body = await response.json().catch(() => ({}))
    return Response.json(body, { status: response.status })
  } catch {
    return Response.json({ error: "backend_unreachable" }, { status: 502 })
  }
}

export async function PATCH(request: NextRequest) {
  const bypassAuth = process.env.AUTH_DEV_BYPASS === "true"
  if (!bypassAuth) {
    const role = await getServerRole(request)
    if (!role) {
      return Response.json({ error: "unauthenticated" }, { status: 401 })
    }
    if (!hasRole(role, "admin")) {
      return Response.json({ error: "forbidden" }, { status: 403 })
    }
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }

  // Validate and convert to snake_case
  const updates: Record<string, number> = {}
  for (const key of VALID_KEYS) {
    if (key in body) {
      const val = body[key]
      if (typeof val !== "number" || !Number.isFinite(val) || val < 0 || val > 1) {
        return Response.json(
          { error: `${key} must be a number between 0 and 1` },
          { status: 400 },
        )
      }
      updates[KEY_TO_SNAKE[key]] = val
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json(
      { error: "No valid threshold keys provided" },
      { status: 400 },
    )
  }

  // Actor attribution
  const actor = await getActor(request)
  const forwardBody: Record<string, unknown> = { ...updates }
  if (actor) forwardBody.actor = actor

  log.info("Updating thresholds", { updates, actor: actor?.user_id })

  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/thresholds`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forwardBody),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      log.warn("Backend rejected threshold update", { status: res.status })
      const upstream = await res.json().catch(() => ({}))
      return Response.json(
        { error: "backend_error", ...upstream },
        { status: res.status },
      )
    }

    const result = await res.json().catch(() => ({}))
    return Response.json({ ok: true, ...result })
  } catch (err) {
    log.error("Threshold update failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json(
      { error: "backend_unreachable" },
      { status: 502 },
    )
  }
}
