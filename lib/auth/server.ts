import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import { isRole, type Role } from "@/lib/auth/rbac"

export async function getServerRole(req: NextRequest): Promise<Role | null> {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  if (!token || !isRole(token.role)) return null
  return token.role
}
