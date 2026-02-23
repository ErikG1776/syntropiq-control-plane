const BACKEND_BASE_URL = "http://localhost:8000"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    const upstream = await fetch(`${BACKEND_BASE_URL}/api/v1/events/stream`, {
      cache: "no-store",
      headers: {
        Accept: "text/event-stream",
      },
    })

    if (!upstream.ok || !upstream.body) {
      return new Response("event: error\ndata: upstream_unavailable\n\n", {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      })
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch {
    return new Response("event: error\ndata: upstream_exception\n\n", {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    })
  }
}
