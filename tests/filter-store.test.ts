import { describe, it, expect } from "vitest"
import { activeFilterCount, TIME_RANGES } from "@/store/filter-store"
import type { FilterState } from "@/store/filter-store"

describe("activeFilterCount", () => {
  const emptyFilters: FilterState = {
    agentId: "",
    severity: "",
    eventType: "",
    status: "",
    timeRange: 0,
    q: "",
  }

  it("returns 0 for empty filters", () => {
    expect(activeFilterCount(emptyFilters)).toBe(0)
  })

  it("counts agentId filter", () => {
    expect(activeFilterCount({ ...emptyFilters, agentId: "agent_1" })).toBe(1)
  })

  it("counts severity filter", () => {
    expect(activeFilterCount({ ...emptyFilters, severity: "warn" })).toBe(1)
  })

  it("counts eventType filter", () => {
    expect(activeFilterCount({ ...emptyFilters, eventType: "mutation" })).toBe(1)
  })

  it("counts status filter", () => {
    expect(activeFilterCount({ ...emptyFilters, status: "active" })).toBe(1)
  })

  it("counts timeRange filter when > 0", () => {
    expect(activeFilterCount({ ...emptyFilters, timeRange: 300_000 })).toBe(1)
  })

  it("does not count timeRange of 0", () => {
    expect(activeFilterCount({ ...emptyFilters, timeRange: 0 })).toBe(0)
  })

  it("counts search query", () => {
    expect(activeFilterCount({ ...emptyFilters, q: "trust" })).toBe(1)
  })

  it("counts all filters when active", () => {
    expect(
      activeFilterCount({
        agentId: "a1",
        severity: "error",
        eventType: "mutation",
        status: "suppressed",
        timeRange: 60_000,
        q: "search",
      }),
    ).toBe(6)
  })
})

describe("TIME_RANGES", () => {
  it("has 6 presets", () => {
    expect(TIME_RANGES).toHaveLength(6)
  })

  it("first preset is 'All' with ms=0", () => {
    expect(TIME_RANGES[0].label).toBe("All")
    expect(TIME_RANGES[0].ms).toBe(0)
  })

  it("presets are in ascending order", () => {
    for (let i = 1; i < TIME_RANGES.length; i++) {
      expect(TIME_RANGES[i].ms).toBeGreaterThan(TIME_RANGES[i - 1].ms)
    }
  })

  it("last preset is 24h", () => {
    const last = TIME_RANGES[TIME_RANGES.length - 1]
    expect(last.label).toBe("24h")
    expect(last.ms).toBe(24 * 60 * 60_000)
  })
})
