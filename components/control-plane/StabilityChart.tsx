"use client"

import { useMemo } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"

import { Card } from "@/components/ui/card"
import { useGovernanceStore } from "@/store/governance-store"

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function StabilityChart() {
  const history = useGovernanceStore((s) => s.stabilityHistory)
  const thresholds = useGovernanceStore((s) => s.snapshot?.thresholds)

  const { normalizedHistory, rollingMax, highVolatility, volatility } = useMemo(() => {
    const slice = history.slice(-100)
    const rawValues = slice.map((point) => point.value)
    const rollingMax = Math.max(1, ...rawValues)
    const normalizedHistory = slice.map((point) => ({
      ts: point.ts,
      value: clamp(point.value / rollingMax, 0, 1),
      raw: point.value,
    }))
    const last20 = normalizedHistory.slice(-20).map((point) => point.value)
    const volatility = stddev(last20)
    return {
      normalizedHistory,
      rollingMax,
      highVolatility: volatility > 0.14,
      volatility,
    }
  }, [history])

  const normalizeThreshold = (value: number | undefined) =>
    value !== undefined && value >= 0 ? clamp(value / rollingMax, 0, 1) : -1

  const trustThreshold = normalizeThreshold(thresholds?.trustThreshold)
  const suppressionThreshold = normalizeThreshold(thresholds?.suppressionThreshold)

  return (
    <Card
      className={[
        "p-5 transition-colors duration-500",
        highVolatility ? "volatility-overlay volatility-pulse" : "",
      ].join(" ")}
    >
      <h2 className="text-base font-semibold mb-1">
        Stability Over Time
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Normalized trust-authority composite (0–1) {trustThreshold < 0 && "(thresholds unavailable)"}
      </p>
      {highVolatility && (
        <div className="mb-3 inline-flex items-center rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-300">
          High Volatility ({volatility.toFixed(3)})
        </div>
      )}

      {normalizedHistory.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Waiting for stability data...
        </p>
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={normalizedHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" tick={false} />
              <YAxis domain={[0, 1]} />
              <Tooltip
                formatter={(value) => {
                  if (typeof value !== "number") return ["-", "stability"]
                  return [value.toFixed(3), "stability"]
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={highVolatility ? "#f97316" : "#2563eb"}
                dot={false}
                strokeWidth={highVolatility ? 2.7 : 2.2}
                isAnimationActive
                animationDuration={550}
                animationEasing="ease-in-out"
                className={highVolatility ? "stability-high-vol-line" : ""}
              />

              {trustThreshold >= 0 && (
                <ReferenceLine
                  y={trustThreshold}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                />
              )}
              {suppressionThreshold >= 0 && (
                <ReferenceLine
                  y={suppressionThreshold}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
