import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { isRole, type Role } from "@/lib/auth/rbac"

interface DemoUser {
  email: string
  password: string
  role: Role
}

const DEFAULT_DEMO_USERS: DemoUser[] = [
  { email: "viewer@local", password: "viewer", role: "viewer" },
  { email: "operator@local", password: "operator", role: "operator" },
  { email: "admin@local", password: "admin", role: "admin" },
]

function getDemoUsers(): DemoUser[] {
  const raw = process.env.AUTH_DEMO_USERS_JSON
  if (!raw) return DEFAULT_DEMO_USERS

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_DEMO_USERS

    const users = parsed
      .map((entry): DemoUser | null => {
        if (!entry || typeof entry !== "object") return null
        const email = (entry as { email?: unknown }).email
        const password = (entry as { password?: unknown }).password
        const role = (entry as { role?: unknown }).role
        if (typeof email !== "string" || typeof password !== "string" || !isRole(role)) {
          return null
        }
        return { email, password, role }
      })
      .filter((entry): entry is DemoUser => entry !== null)

    return users.length > 0 ? users : DEFAULT_DEMO_USERS
  } catch {
    return DEFAULT_DEMO_USERS
  }
}

const DEMO_USERS = getDemoUsers()

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email
        const password = credentials?.password
        if (typeof email !== "string" || typeof password !== "string") return null

        const user = DEMO_USERS.find((candidate) => candidate.email === email)
        if (!user || user.password !== password) return null

        return {
          id: user.email,
          email: user.email,
          role: user.role,
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user && isRole((user as { role?: unknown }).role)) {
        token.role = user.role
      }
      if (user && typeof user.email === "string") {
        token.email = user.email
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && isRole(token.role)) {
        session.user.role = token.role
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
}
