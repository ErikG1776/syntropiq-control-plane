import { describe, it, expect, beforeEach, vi } from "vitest"

// We need to mock next/server since it's a Next.js server module
vi.mock("next/server", () => {
  class MockNextResponse {
    status: number
    _headers: Map<string, string>
    _body: unknown

    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this._body = body
      this.status = init?.status ?? 200
      this._headers = new Map(Object.entries(init?.headers ?? {}))
    }

    get headers() {
      return {
        get: (key: string) => this._headers.get(key) ?? null,
        set: (key: string, val: string) => { this._headers.set(key, val) },
        entries: () => this._headers.entries(),
      }
    }

    async json() {
      return this._body
    }

    static next() {
      const res = new MockNextResponse(null, { status: 200 })
      return res
    }

    static json(body: unknown, init?: { status?: number }) {
      const res = new MockNextResponse(body, init)
      return res
    }
  }

  return {
    NextResponse: MockNextResponse,
  }
})

// Helper to create mock NextRequest
function createMockRequest(
  pathname: string,
  options?: { method?: string; headers?: Record<string, string> },
) {
  return {
    nextUrl: { pathname },
    method: options?.method ?? "GET",
    headers: {
      get: (key: string) => options?.headers?.[key] ?? null,
    },
  }
}

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules()
    // Clear env vars
    delete process.env.API_KEY
    delete process.env.ALLOWED_ORIGINS
  })

  it("adds security headers to all responses", async () => {
    const { middleware } = await import("@/middleware")
    const req = createMockRequest("/control-plane")
    const res = middleware(req as never)

    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(res.headers.get("X-Frame-Options")).toBe("DENY")
    expect(res.headers.get("X-XSS-Protection")).toBe("1; mode=block")
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin")
  })

  it("adds CORS headers to API routes", async () => {
    const { middleware } = await import("@/middleware")
    const req = createMockRequest("/api/governance/snapshot")
    const res = middleware(req as never)

    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS")
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type")
  })

  it("does not add CORS headers to non-API routes", async () => {
    const { middleware } = await import("@/middleware")
    const req = createMockRequest("/control-plane")
    const res = middleware(req as never)

    expect(res.headers.get("Access-Control-Allow-Methods")).toBeNull()
  })

  it("returns 204 for OPTIONS preflight on API routes", async () => {
    const { middleware } = await import("@/middleware")
    const req = createMockRequest("/api/health", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000" },
    })
    const res = middleware(req as never)
    expect(res.status).toBe(204)
  })

  it("allows requests without API key when env not set", async () => {
    const { middleware } = await import("@/middleware")
    const req = createMockRequest("/api/governance/snapshot")
    const res = middleware(req as never)

    // Should pass through (200), not 401
    expect(res.status).toBe(200)
  })

  it("rejects API requests without key when API_KEY is set", async () => {
    process.env.API_KEY = "test-secret-key"
    const { middleware } = await import("@/middleware")
    const req = createMockRequest("/api/governance/snapshot")
    const res = middleware(req as never)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe("Unauthorized")
  })

  it("allows API requests with correct X-Api-Key header", async () => {
    process.env.API_KEY = "test-secret-key"
    const { middleware } = await import("@/middleware")
    const req = createMockRequest("/api/governance/snapshot", {
      headers: { "X-Api-Key": "test-secret-key" },
    })
    const res = middleware(req as never)
    expect(res.status).toBe(200)
  })

  it("allows API requests with correct Bearer token", async () => {
    process.env.API_KEY = "test-secret-key"
    const { middleware } = await import("@/middleware")
    const req = createMockRequest("/api/governance/snapshot", {
      headers: { Authorization: "Bearer test-secret-key" },
    })
    const res = middleware(req as never)
    expect(res.status).toBe(200)
  })

  it("skips auth for /api/health even when API_KEY is set", async () => {
    process.env.API_KEY = "test-secret-key"
    const { middleware } = await import("@/middleware")
    const req = createMockRequest("/api/health")
    const res = middleware(req as never)

    // Health should always pass
    expect(res.status).toBe(200)
  })

  it("uses wildcard origin by default", async () => {
    const { middleware } = await import("@/middleware")
    const req = createMockRequest("/api/health")
    const res = middleware(req as never)

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*")
  })

  it("respects ALLOWED_ORIGINS when matching", async () => {
    process.env.ALLOWED_ORIGINS = "http://localhost:3000, http://example.com"
    const { middleware } = await import("@/middleware")
    const req = createMockRequest("/api/health", {
      headers: { Origin: "http://localhost:3000" },
    })
    const res = middleware(req as never)

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000")
  })

  it("blocks non-allowed origins", async () => {
    process.env.ALLOWED_ORIGINS = "http://localhost:3000"
    const { middleware } = await import("@/middleware")
    const req = createMockRequest("/api/health", {
      headers: { Origin: "http://evil.com" },
    })
    const res = middleware(req as never)

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("")
  })
})

describe("middleware config", () => {
  it("exports a matcher config", async () => {
    const { config } = await import("@/middleware")
    expect(config).toBeDefined()
    expect(config.matcher).toBeDefined()
    expect(config.matcher.length).toBeGreaterThan(0)
  })
})
