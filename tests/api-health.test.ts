import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the schema import
vi.mock("@/lib/governance/schema", () => ({
  SCHEMA_VERSION: "0.2.0",
}))

describe("/api/health", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("returns 200 with health payload", async () => {
    // Mock fetch for the backend check
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true }),
    )

    // Dynamic import to pick up mocks
    const { GET } = await import("@/app/api/health/route")
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe("ok")
    expect(body.schemaVersion).toBe("0.2.0")
    expect(body.timestamp).toBeDefined()
    expect(body.backend).toBeDefined()
    expect(body.backend.status).toBe("reachable")
  })

  it("marks backend as unreachable when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    )

    const { GET } = await import("@/app/api/health/route")
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.backend.status).toBe("unreachable")
  })

  it("marks backend as unreachable when response not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    )

    const { GET } = await import("@/app/api/health/route")
    const response = await GET()
    const body = await response.json()

    expect(body.backend.status).toBe("unreachable")
  })

  it("includes version and node fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true }),
    )

    const { GET } = await import("@/app/api/health/route")
    const response = await GET()
    const body = await response.json()

    expect(body.version).toBeDefined()
    expect(body.node).toBeDefined()
    expect(typeof body.uptime).toBe("number")
  })

  it("includes no-cache header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true }),
    )

    const { GET } = await import("@/app/api/health/route")
    const response = await GET()

    expect(response.headers.get("Cache-Control")).toBe("no-cache")
  })
})
