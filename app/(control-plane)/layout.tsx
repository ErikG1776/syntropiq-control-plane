"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { AuthGate } from "@/components/control-plane/AuthGate"
import { SidebarNav } from "@/components/control-plane/SidebarNav"
import { CommandPalette } from "@/components/control-plane/CommandPalette"
import { ErrorBoundary } from "@/components/control-plane/ErrorBoundary"
import { Separator } from "@/components/ui/separator"

export default function ControlPlaneLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (pathname === "/login") {
    return <AuthGate>{children}</AuthGate>
  }

  return (
    <AuthGate>
      <div className="flex min-h-screen bg-background text-foreground">
        <SidebarNav />
        <CommandPalette />
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 py-5 pt-14 lg:pt-5 md:px-8">
            <Separator className="mb-6" />
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
      </div>
    </AuthGate>
  )
}
