import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Syntropiq Control Plane",
  description: "Enterprise governance UI for autonomous decision systems",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
