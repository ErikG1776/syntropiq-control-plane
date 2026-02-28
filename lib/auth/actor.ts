import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import { isRole, type Role } from "@/lib/auth/rbac"

export type Actor = {
  user_id: string
  role: Role
  source: "control-plane"
}

export async function getActor(req: NextRequest): Promise<Actor | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  const email = typeof token?.email === "string" ? token.email : null
  const role = isRole(token?.role) ? token.role : null
  if (!email || !role) return null
  return { user_id: email, role, source: "control-plane" }
}
