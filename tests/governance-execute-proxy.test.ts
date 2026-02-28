import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"

const getTokenMock = vi.fn()
vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}))

describe("/api/control-plane/governance/execute", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    vi.clearAllMocks()
    delete process.env.AUTH_DEV_BYPASS
  })

  it("allows when bypass is enabled", async () => {
    process.env.AUTH_DEV_BYPASS = "true"
    getTokenMock.mockResolvedValue({ email: "operator@local", role: "operator" })
    const body = {
      run_id: "run-1",
      strategy: "highest_trust_v1",
      selected_agents: ["agent-a"],
    }
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: vi.fn().mockResolvedValue(body),
    })
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("@/app/api/control-plane/governance/execute/route")
    const request = new Request("http://localhost/api/control-plane/governance/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: { type: "demo" } }),
    }) as unknown as NextRequest
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual(body)
    const upstreamArgs = fetchMock.mock.calls[0]
    const upstreamBody = JSON.parse(String((upstreamArgs[1] as { body?: unknown }).body))
    expect(upstreamBody.actor).toEqual({
      user_id: "operator@local",
      role: "operator",
      source: "control-plane",
    })
  })

  it("returns 401 when bypass disabled and user is unauthenticated", async () => {
    process.env.AUTH_DEV_BYPASS = "false"
    getTokenMock.mockResolvedValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("@/app/api/control-plane/governance/execute/route")
    const request = new Request("http://localhost/api/control-plane/governance/execute", {
      method: "POST",
      body: JSON.stringify({ task: { type: "demo" } }),
    }) as unknown as NextRequest
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ error: "unauthenticated" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns 403 for viewer role", async () => {
    process.env.AUTH_DEV_BYPASS = "false"
    getTokenMock.mockResolvedValue({ email: "viewer@local", role: "viewer" })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("@/app/api/control-plane/governance/execute/route")
    const request = new Request("http://localhost/api/control-plane/governance/execute", {
      method: "POST",
      body: JSON.stringify({ task: { type: "demo" } }),
    }) as unknown as NextRequest
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json).toEqual({ error: "forbidden" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("allows operator role and passes through to backend", async () => {
    process.env.AUTH_DEV_BYPASS = "false"
    getTokenMock.mockResolvedValue({ email: "operator@local", role: "operator" })
    const body = { strategy: "highest_trust_v1" }
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: vi.fn().mockResolvedValue(body),
    })
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("@/app/api/control-plane/governance/execute/route")
    const request = new Request("http://localhost/api/control-plane/governance/execute", {
      method: "POST",
      body: JSON.stringify({ task: { id: "t1" } }),
    }) as unknown as NextRequest
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual(body)
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/governance/execute",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    )
    const upstreamArgs = fetchMock.mock.calls[0]
    const upstreamBody = JSON.parse(String((upstreamArgs[1] as { body?: unknown }).body))
    expect(upstreamBody.actor).toEqual({
      user_id: "operator@local",
      role: "operator",
      source: "control-plane",
    })
  })

  it("passes through backend 400", async () => {
    process.env.AUTH_DEV_BYPASS = "true"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 400,
        json: vi.fn().mockResolvedValue({ error: "invalid_task" }),
      }),
    )

    const { POST } = await import("@/app/api/control-plane/governance/execute/route")
    const request = new Request("http://localhost/api/control-plane/governance/execute", {
      method: "POST",
      body: JSON.stringify({ task: {} }),
    }) as unknown as NextRequest
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: "invalid_task" })
  })

  it("passes through backend 503", async () => {
    process.env.AUTH_DEV_BYPASS = "true"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 503,
        json: vi.fn().mockResolvedValue({ error: "no_eligible_agents" }),
      }),
    )

    const { POST } = await import("@/app/api/control-plane/governance/execute/route")
    const request = new Request("http://localhost/api/control-plane/governance/execute", {
      method: "POST",
      body: JSON.stringify({ task: { type: "routing_test" } }),
    }) as unknown as NextRequest
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(503)
    expect(json).toEqual({ error: "no_eligible_agents" })
  })

  it("returns 502 on backend network failure", async () => {
    process.env.AUTH_DEV_BYPASS = "true"
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))

    const { POST } = await import("@/app/api/control-plane/governance/execute/route")
    const request = new Request("http://localhost/api/control-plane/governance/execute", {
      method: "POST",
      body: JSON.stringify({ task: { type: "demo" } }),
    }) as unknown as NextRequest
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(502)
    expect(json).toEqual({ error: "backend_unreachable" })
  })

  it("returns 400 on invalid JSON input", async () => {
    process.env.AUTH_DEV_BYPASS = "true"
    vi.stubGlobal("fetch", vi.fn())

    const { POST } = await import("@/app/api/control-plane/governance/execute/route")
    const request = new Request("http://localhost/api/control-plane/governance/execute", {
      method: "POST",
      body: "{bad json",
    }) as unknown as NextRequest
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: "invalid_json" })
  })
})
