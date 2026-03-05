export type Role = "viewer" | "operator" | "admin"

const ROLE_LEVEL: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
}

export function isRole(value: unknown): value is Role {
  return value === "viewer" || value === "operator" || value === "admin"
}

export function hasRole(userRole: Role, required: Role): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[required]
}

export function requireRole(
  userRole: Role,
  required: Role,
): { ok: true } | { ok: false; status: 403; error: "forbidden" } {
  if (!hasRole(userRole, required)) {
    return { ok: false, status: 403, error: "forbidden" }
  }
  return { ok: true }
}
