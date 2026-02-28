import type { NextRequest } from "next/server"
import { hasRole } from "@/lib/auth/rbac"
import { getServerRole } from "@/lib/auth/server"

const BACKEND_BASE_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000"

export const dynamic = "force-dynamic"
export const revalidate = 0

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

  return Response.json({ error: "not_implemented" }, { status: 501 })
}
