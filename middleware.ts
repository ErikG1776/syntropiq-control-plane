import { NextResponse, type NextRequest } from "next/server"
import { createComponentLogger, generateTraceId } from "@/lib/logger"

/**
 * Next.js middleware — runs on every request.
 *
 * Responsibilities:
 * 1. Security headers on all responses
 * 2. CORS for API routes
 * 3. Optional API key authentication for /api/* routes
 * 4. Sliding-window rate limiting for API routes
 * 5. Structured request logging
 */

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
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

// ---------------------------------------------------------------------------
// Rate limiter — in-memory sliding window per client IP
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX ?? "100", 10)
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000", 10)

interface RateBucket {
  timestamps: number[]
}

const rateBuckets = new Map<string, RateBucket>()

let lastPrune = Date.now()
const PRUNE_INTERVAL_MS = 300_000

function pruneStale(now: number) {
  if (now - lastPrune < PRUNE_INTERVAL_MS) return
  lastPrune = now
  for (const [key, bucket] of rateBuckets) {
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
    if (bucket.timestamps.length === 0) rateBuckets.delete(key)
  }
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  )
}

function checkRateLimit(clientId: string): {
  allowed: boolean
  remaining: number
  resetMs: number
} {
  const now = Date.now()
  pruneStale(now)

  let bucket = rateBuckets.get(clientId)
  if (!bucket) {
    bucket = { timestamps: [] }
    rateBuckets.set(clientId, bucket)
  }

  bucket.timestamps = bucket.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)

  if (bucket.timestamps.length >= RATE_LIMIT_MAX) {
    const oldest = bucket.timestamps[0]
    const resetMs = oldest + RATE_LIMIT_WINDOW_MS - now
    return { allowed: false, remaining: 0, resetMs }
  }

  bucket.timestamps.push(now)
  const remaining = RATE_LIMIT_MAX - bucket.timestamps.length
  return { allowed: true, remaining, resetMs: RATE_LIMIT_WINDOW_MS }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const traceId = generateTraceId()
  const log = createComponentLogger("middleware", traceId)

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

  // --- Rate limiting (API routes, skip health + NextAuth) ---
  if (isApiRoute(pathname) && !isHealthRoute(pathname) && !isNextAuthRoute(pathname)) {
    const clientIp = getClientIp(request)
    const { allowed, remaining, resetMs } = checkRateLimit(clientIp)

    if (!allowed) {
      log.warn("Rate limit exceeded", { clientIp, pathname })
      return NextResponse.json(
        { error: "Too Many Requests", message: "Rate limit exceeded. Try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(resetMs / 1000)),
            "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(resetMs / 1000)),
          },
        },
      )
    }
  }

  // --- API key authentication ---
  const apiKey = process.env.API_KEY
  if (apiKey && isApiRoute(pathname) && !isHealthRoute(pathname) && !isNextAuthRoute(pathname)) {
    const providedKey =
      request.headers.get("X-Api-Key") ??
      request.headers.get("Authorization")?.replace("Bearer ", "")

    if (providedKey !== apiKey) {
      log.warn("Unauthorized API request", { pathname, method: request.method })
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

    // Attach rate limit headers to successful responses
    if (!isHealthRoute(pathname) && !isNextAuthRoute(pathname)) {
      const clientIp = getClientIp(request)
      const bucket = rateBuckets.get(clientIp)
      const remaining = bucket ? Math.max(0, RATE_LIMIT_MAX - bucket.timestamps.length) : RATE_LIMIT_MAX
      response.headers.set("X-RateLimit-Limit", String(RATE_LIMIT_MAX))
      response.headers.set("X-RateLimit-Remaining", String(remaining))
    }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|replays/).*)",
  ],
}
