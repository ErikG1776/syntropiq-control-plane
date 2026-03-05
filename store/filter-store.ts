"use client"

/**
 * Cross-filtering bus: URL-synced filter context.
 *
 * All filter state is stored in URL search params via `nuqs`, making every
 * filter combination shareable and bookmarkable.
 *
 * Components subscribe to `useFilterStore()` and react to changes.
 * Clicking an agent in the registry sets `agentId` globally —
 * the events page auto-filters to that agent.
 */

import {
  parseAsString,
  parseAsInteger,
  useQueryState,
} from "nuqs"

// ---------------------------------------------------------------------------
// Individual filter hooks (URL-synced)
// ---------------------------------------------------------------------------

export function useAgentFilter() {
  return useQueryState("agentId", parseAsString.withDefault(""))
}

export function useSeverityFilter() {
  return useQueryState("severity", parseAsString.withDefault(""))
}

export function useEventTypeFilter() {
  return useQueryState("eventType", parseAsString.withDefault(""))
}

export function useStatusFilter() {
  return useQueryState("status", parseAsString.withDefault(""))
}

export function useTimeRangeFilter() {
  return useQueryState("timeRange", parseAsInteger.withDefault(0))
}

export function useSearchFilter() {
  return useQueryState("q", parseAsString.withDefault(""))
}

// ---------------------------------------------------------------------------
// Composite hook: all filters at once
// ---------------------------------------------------------------------------

export interface FilterState {
  agentId: string
  severity: string
  eventType: string
  status: string
  timeRange: number
  q: string
}

export interface FilterActions {
  setAgentId: (v: string) => void
  setSeverity: (v: string) => void
  setEventType: (v: string) => void
  setStatus: (v: string) => void
  setTimeRange: (v: number) => void
  setSearch: (v: string) => void
  clearAll: () => void
}

export function useFilters(): FilterState & FilterActions {
  const [agentId, setAgentId] = useAgentFilter()
  const [severity, setSeverity] = useSeverityFilter()
  const [eventType, setEventType] = useEventTypeFilter()
  const [status, setStatus] = useStatusFilter()
  const [timeRange, setTimeRange] = useTimeRangeFilter()
  const [q, setSearch] = useSearchFilter()

  const clearAll = () => {
    setAgentId("")
    setSeverity("")
    setEventType("")
    setStatus("")
    setTimeRange(0)
    setSearch("")
  }

  return {
    agentId,
    severity,
    eventType,
    status,
    timeRange,
    q,
    setAgentId,
    setSeverity,
    setEventType,
    setStatus,
    setTimeRange,
    setSearch,
    clearAll,
  }
}

// ---------------------------------------------------------------------------
// Time range presets
// ---------------------------------------------------------------------------

export const TIME_RANGES = [
  { label: "All", ms: 0 },
  { label: "5m", ms: 5 * 60_000 },
  { label: "15m", ms: 15 * 60_000 },
  { label: "1h", ms: 60 * 60_000 },
  { label: "6h", ms: 6 * 60 * 60_000 },
  { label: "24h", ms: 24 * 60 * 60_000 },
] as const

// ---------------------------------------------------------------------------
// Active filter count helper
// ---------------------------------------------------------------------------

export function activeFilterCount(f: FilterState): number {
  let count = 0
  if (f.agentId) count++
  if (f.severity) count++
  if (f.eventType) count++
  if (f.status) count++
  if (f.timeRange > 0) count++
  if (f.q) count++
  return count
}
