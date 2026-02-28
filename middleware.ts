import { NextResponse, type NextRequest } from "next/server"

/**
 * Next.js middleware — runs on every request.
 *
 * Responsibilities:
 * 1. Security headers on all responses
 * 2. CORS for API routes
 * 3. Optional API key authentication for /api/* routes
 */

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
  "Access-Control-Max-Age": "86400",
}

function getAllowedOrigins(): string[] {
  const envOrigins = process.env.ALLOWED_ORIGINS
  if (envOrigins) return envOrigins.split(",").map((o) => o.trim())
  return ["*"]
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/")
}

function isHealthRoute(pathname: string): boolean {
  return pathname === "/api/health"
}

function isNextAuthRoute(pathname: string): boolean {
  return pathname.startsWith("/api/auth/")
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // --- CORS preflight ---
  if (request.method === "OPTIONS" && isApiRoute(pathname)) {
    const origin = request.headers.get("Origin") ?? "*"
    const allowedOrigins = getAllowedOrigins()
    const allowOrigin = allowedOrigins.includes("*") ? "*" : (allowedOrigins.includes(origin) ? origin : "")

    return new NextResponse(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        "Access-Control-Allow-Origin": allowOrigin,
      },
    })
  }

  // --- API key authentication ---
  // Skip auth for health endpoint (needed by load balancers)
  // Only enforce if API_KEY env var is set
  const apiKey = process.env.API_KEY
  if (apiKey && isApiRoute(pathname) && !isHealthRoute(pathname) && !isNextAuthRoute(pathname)) {
    const providedKey =
      request.headers.get("X-Api-Key") ??
      request.headers.get("Authorization")?.replace("Bearer ", "")

    if (providedKey !== apiKey) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Valid API key required" },
        { status: 401 },
      )
    }
  }

  // --- Proceed with security & CORS headers ---
  const response = NextResponse.next()

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }

  if (isApiRoute(pathname)) {
    const origin = request.headers.get("Origin") ?? "*"
    const allowedOrigins = getAllowedOrigins()
    const allowOrigin = allowedOrigins.includes("*") ? "*" : (allowedOrigins.includes(origin) ? origin : "")

    response.headers.set("Access-Control-Allow-Origin", allowOrigin)
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(key, value)
    }
  }

  return response
}

export const config = {
  matcher: [
    // Match all routes except static files and _next internals
    "/((?!_next/static|_next/image|favicon.ico|replays/).*)",
  ],
}
