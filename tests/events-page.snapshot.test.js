import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("events page snapshot markers", () => {
  const source = fs.readFileSync("app/(control-plane)/events/page.tsx", "utf8")
  const expectedMarkers = [
    "Live governance event stream with filtering and search.",
    "Live Governance Events (SSE)",
    "<EventStreamPanel fullPage />",
  ]

  for (const marker of expectedMarkers) {
    assert.equal(
      source.includes(marker),
      true,
      `Expected snapshot marker missing: ${marker}`,
    )
  }
})
