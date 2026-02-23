import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("executions page snapshot markers", () => {
  const source = fs.readFileSync("app/(control-plane)/executions/page.tsx", "utf8")
  const expectedMarkers = [
    "Governance cycle summaries from the control-plane adapter.",
    "Recent Governance Cycles",
    "authority redistribution",
  ]

  for (const marker of expectedMarkers) {
    assert.equal(
      source.includes(marker),
      true,
      `Expected snapshot marker missing: ${marker}`,
    )
  }
})
