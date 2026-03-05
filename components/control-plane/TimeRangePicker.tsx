"use client"

import { TIME_RANGES, useTimeRangeFilter } from "@/store/filter-store"

export function TimeRangePicker() {
  const [timeRange, setTimeRange] = useTimeRangeFilter()

  return (
    <div className="flex gap-1">
      {TIME_RANGES.map((tr) => (
        <button
          key={tr.ms}
          onClick={() => setTimeRange(tr.ms)}
          className={`px-2 py-1 rounded text-xs border transition-colors ${
            timeRange === tr.ms
              ? "bg-primary text-primary-foreground"
              : "bg-transparent text-muted-foreground hover:bg-muted"
          }`}
        >
          {tr.label}
        </button>
      ))}
    </div>
  )
}
