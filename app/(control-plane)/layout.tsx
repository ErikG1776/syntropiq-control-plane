import type { ReactNode } from "react"
import { SidebarNav } from "@/components/control-plane/SidebarNav"
import { Separator } from "@/components/ui/separator"

export default function ControlPlaneLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <SidebarNav />
      <main className="flex-1 overflow-y-auto">
        <div className="px-6 py-5 md:px-8">
          <Separator className="mb-6" />
          {children}
        </div>
      </main>
    </div>
  )
}
