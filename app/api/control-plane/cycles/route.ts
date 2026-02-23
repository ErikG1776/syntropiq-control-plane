import type { BackendGovernanceCycleV1 } from "@/lib/adapters/telemetry"

const BACKEND_BASE_URL = "http://localhost:8000"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = searchParams.get("limit") ?? "20"
  const target = `${BACKEND_BASE_URL}/api/v1/cycles?limit=${encodeURIComponent(limit)}`

  try {
    const res = await fetch(target, { cache: "no-store" })
    if (!res.ok) return Response.json([], { status: 200 })
    const json = await res.json()
    if (!Array.isArray(json)) return Response.json([], { status: 200 })
    return Response.json(json as BackendGovernanceCycleV1[], { status: 200 })
  } catch {
    return Response.json([], { status: 200 })
  }
}
