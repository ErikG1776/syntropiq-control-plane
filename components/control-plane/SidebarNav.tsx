"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Separator } from "@/components/ui/separator"

const navLinks = [
  { href: "/control-plane", label: "Control Plane" },
  { href: "/agents", label: "Agents" },
  { href: "/events", label: "Events" },
  { href: "/thresholds", label: "Thresholds" },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <aside className="h-screen w-64 shrink-0 border-r bg-muted/20 px-4 py-6">
      <div className="text-lg font-semibold tracking-tight">Syntropiq</div>
      <Separator className="my-4" />
      <nav className="space-y-1 text-sm">
        {navLinks.map((link) => {
          const active = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`block rounded px-2 py-2 transition-colors ${
                active
                  ? "bg-muted font-semibold text-foreground"
                  : "text-foreground/80 hover:bg-muted hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
