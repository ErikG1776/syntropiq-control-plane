"use client"

import { Suspense, type ReactNode } from "react"
import { ThemeProvider } from "next-themes"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { Toaster } from "sonner"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <Suspense>
        <NuqsAdapter>
          {children}
          <Toaster richColors closeButton position="bottom-right" />
        </NuqsAdapter>
      </Suspense>
    </ThemeProvider>
  )
}
