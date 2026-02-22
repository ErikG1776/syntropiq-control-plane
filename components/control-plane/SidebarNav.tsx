"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Separator } from "@/components/ui/separator"

const navLinks = [
  { href: "/control-plane", label: "Overview" },
  { href: "/agents", label: "Agents" },
  { href: "/events", label: "Events" },
  { href: "/thresholds", label: "Thresholds" },
  { href: "/executions", label: "Executions" },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <aside className="h-screen w-56 shrink-0 border-r bg-muted/10 px-4 py-6 flex flex-col">
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
    </aside>
  )
}
