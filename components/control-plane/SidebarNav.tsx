"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Menu } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const navLinks = [
  { href: "/control-plane", label: "Overview" },
  { href: "/agents", label: "Agents" },
  { href: "/events", label: "Events" },
  { href: "/topology", label: "Topology" },
  { href: "/incidents", label: "Incidents" },
  { href: "/thresholds", label: "Thresholds" },
  { href: "/executions", label: "Executions" },
]

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <>
      <div className="text-lg font-semibold tracking-tight">Syntropiq</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
        Control Plane
      </div>
      <Separator className="my-4" />
      <nav className="space-y-0.5 text-sm flex-1">
        {navLinks.map((link) => {
          const active =
            pathname === link.href ||
            (link.href !== "/control-plane" && pathname.startsWith(link.href))
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={`block rounded px-2 py-1.5 transition-colors ${
                active
                  ? "bg-muted font-semibold text-foreground"
                  : "text-foreground/70 hover:bg-muted hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          )
        })}
      </nav>
      <Separator className="my-4" />
      <div className="text-[10px] text-muted-foreground">
        v0.1.0 &middot; Backend-agnostic
      </div>
    </>
  )
}

/** Desktop sidebar — hidden on mobile. */
function DesktopSidebar() {
  return (
    <aside className="hidden lg:flex h-screen w-56 shrink-0 border-r bg-muted/10 px-4 py-6 flex-col">
      <NavContent />
    </aside>
  )
}

/** Mobile hamburger → Sheet slide-over. */
function MobileSidebar() {
  const [open, setOpen] = useState(false)

  return (
    <div className="lg:hidden fixed top-3 left-3 z-40">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open navigation</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-56 px-4 py-6 flex flex-col">
          <SheetHeader className="p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
          </SheetHeader>
          <NavContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function SidebarNav() {
  return (
    <>
      <DesktopSidebar />
      <MobileSidebar />
    </>
  )
}
