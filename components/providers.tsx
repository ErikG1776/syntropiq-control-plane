"use client"

import { Suspense, type ReactNode } from "react"
import { ThemeProvider } from "next-themes"
import { SessionProvider } from "next-auth/react"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { Toaster } from "sonner"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
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
    </SessionProvider>
  )
}
