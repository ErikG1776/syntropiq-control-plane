"use client"

import { useEffect, type ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { Card } from "@/components/ui/card"

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { status } = useSession()

  const onLoginPage = pathname === "/login"

  useEffect(() => {
    if (onLoginPage) return
    if (status !== "unauthenticated") return

    const query = searchParams?.toString()
    const current = query ? `${pathname}?${query}` : pathname
    router.replace(`/login?next=${encodeURIComponent(current)}`)
  }, [onLoginPage, pathname, router, searchParams, status])

  if (onLoginPage) return <>{children}</>

  if (status === "loading") {
    return (
      <div className="px-4 py-5 pt-14 md:px-8 lg:pt-5">
        <Card className="h-32 animate-pulse" />
      </div>
    )
  }

  if (status === "unauthenticated") return null
  return <>{children}</>
}
