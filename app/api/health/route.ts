import { SCHEMA_VERSION } from "@/lib/governance/schema"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
  let backendStatus: "reachable" | "unreachable" = "unreachable"

  try {
    const res = await fetch(`${backendUrl}/api/v1/agents`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) backendStatus = "reachable"
  } catch {
    backendStatus = "unreachable"
  }

  const payload = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    schemaVersion: SCHEMA_VERSION,
    backend: {
      url: backendUrl,
      status: backendStatus,
    },
    uptime: process.uptime(),
    node: process.version,
  }

  return Response.json(payload, {
    status: 200,
    headers: { "Cache-Control": "no-cache" },
  })
}
