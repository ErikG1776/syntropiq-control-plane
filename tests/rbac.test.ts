import { describe, expect, it } from "vitest"
import { hasRole, requireRole, type Role } from "@/lib/auth/rbac"

describe("rbac", () => {
  it("hasRole enforces hierarchy viewer < operator < admin", () => {
    const roles: Role[] = ["viewer", "operator", "admin"]

    expect(hasRole(roles[0], "viewer")).toBe(true)
    expect(hasRole(roles[0], "operator")).toBe(false)
    expect(hasRole(roles[0], "admin")).toBe(false)

    expect(hasRole(roles[1], "viewer")).toBe(true)
    expect(hasRole(roles[1], "operator")).toBe(true)
    expect(hasRole(roles[1], "admin")).toBe(false)

    expect(hasRole(roles[2], "viewer")).toBe(true)
    expect(hasRole(roles[2], "operator")).toBe(true)
    expect(hasRole(roles[2], "admin")).toBe(true)
  })

  it("requireRole returns forbidden for insufficient role", () => {
    expect(requireRole("viewer", "operator")).toEqual({
      ok: false,
      status: 403,
      error: "forbidden",
    })
  })

  it("requireRole returns ok for sufficient role", () => {
    expect(requireRole("admin", "operator")).toEqual({ ok: true })
  })
})
