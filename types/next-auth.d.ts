import { DefaultSession } from "next-auth"
import type { Role } from "@/lib/auth/rbac"

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      role?: Role
    }
  }

  interface User {
    role?: Role
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role
  }
}
