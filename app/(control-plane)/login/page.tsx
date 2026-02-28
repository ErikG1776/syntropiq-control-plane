"use client"

import { FormEvent, useState } from "react"
import { useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const DEMO_CREDS = [
  { email: "viewer@local", password: "viewer", role: "viewer" },
  { email: "operator@local", password: "operator", role: "operator" },
  { email: "admin@local", password: "admin", role: "admin" },
] as const

export default function LoginPage() {
  const params = useSearchParams()
  const [email, setEmail] = useState("operator@local")
  const [password, setPassword] = useState("operator")
  const [submitting, setSubmitting] = useState(false)

  const nextPath = params.get("next") || "/control-plane"

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
        callbackUrl: nextPath,
      })

      if (!result || result.error) {
        toast.error("Sign in failed", {
          description: "Invalid email or password.",
        })
        return
      }

      window.location.assign(result.url ?? nextPath)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <Card className="w-full p-6">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Access the Syntropiq Control Plane.
        </p>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm text-muted-foreground">
              Email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm text-muted-foreground">
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        {process.env.NODE_ENV !== "production" && (
          <div className="mt-5 rounded-md border p-3">
            <p className="text-xs font-medium text-muted-foreground">Demo creds</p>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {DEMO_CREDS.map((cred) => (
                <p key={cred.email}>
                  {cred.role}: {cred.email} / {cred.password}
                </p>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
