import { mapBackendEventToCanonical, type BackendGovernanceEventV1 } from "@/lib/adapters/telemetry"

const BACKEND_BASE_URL = "http://localhost:8000"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const since = searchParams.get("since")
  const target = new URL(`${BACKEND_BASE_URL}/api/v1/events`)
  if (since) target.searchParams.set("since", since)

  try {
    const res = await fetch(target.toString(), { cache: "no-store" })
    if (!res.ok) {
      return Response.json([], { status: 200 })
    }
    const json = await res.json()
    if (!Array.isArray(json)) return Response.json([], { status: 200 })
    const mapped = json.map((event) =>
      mapBackendEventToCanonical(event as BackendGovernanceEventV1),
    )
    return Response.json(mapped, { status: 200 })
  } catch {
    return Response.json([], { status: 200 })
  }
}
