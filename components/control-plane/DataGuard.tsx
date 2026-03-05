"use client"

import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { useGovernanceStore } from "@/store/governance-store"

interface DataGuardProps {
  children: ReactNode
  /** Message shown when not connected. */
  emptyMessage?: string
  /** Render skeleton loaders instead of empty message when connecting. */
  skeleton?: ReactNode
}

/**
 * Shared wrapper: handles connected / loading / error / empty for any panel.
 *
 * - Not connected + not connecting → empty state with guidance
 * - Connecting → skeleton loader
 * - Error → error card with retry
 * - Connected + has data → renders children
 */
export function DataGuard({
  children,
  emptyMessage = "Connect a datasource to begin monitoring.",
  skeleton,
}: DataGuardProps) {
  const connected = useGovernanceStore((s) => s.connected)
  const connecting = useGovernanceStore((s) => s.connecting)
  const error = useGovernanceStore((s) => s.error)
  const snapshot = useGovernanceStore((s) => s.snapshot)
  const connect = useGovernanceStore((s) => s.connect)
  const source = useGovernanceStore((s) => s.source)

  // Connecting — show skeleton
  if (connecting) {
    return (
      <>
        {skeleton ?? (
          <Card className="p-5 space-y-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-4 w-32" />
          </Card>
        )}
      </>
    )
  }

  // Error state with retry
  if (error && !connected) {
    return (
      <Card className="p-5 space-y-3">
        <div className="text-sm font-medium text-destructive">Connection Error</div>
        <p className="text-sm text-muted-foreground">{error}</p>
        {source && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => connect(source)}
          >
            Retry
          </Button>
        )}
      </Card>
    )
  }

  // Not connected
  if (!connected) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </Card>
    )
  }

  // Connected but no data yet
  if (!snapshot) {
    return (
      <>
        {skeleton ?? (
          <Card className="p-5 space-y-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-32 w-full" />
          </Card>
        )}
      </>
    )
  }

  // All good
  return <>{children}</>
}
