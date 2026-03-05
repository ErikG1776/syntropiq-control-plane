"use client"

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

export function StabilityChart() {
  const history = useGovernanceStore((s) => s.stabilityHistory)
  const thresholds = useGovernanceStore((s) => s.snapshot?.thresholds)

  const trustThreshold = thresholds?.trustThreshold ?? -1
  const suppressionThreshold = thresholds?.suppressionThreshold ?? -1

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-1">
        Stability Over Time
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Normalized weighted mean: &Sigma;(trust &times; authority) / &Sigma;(authority){trustThreshold < 0 && " — thresholds unavailable"}
      </p>

      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Waiting for stability data...
        </p>
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history || []}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(v) => new Date(v).toLocaleTimeString()}
              />
              <YAxis domain={[0, 1]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--popover-foreground))",
                  borderRadius: "0.375rem",
                }}
              />
              <Line dataKey="value" />

              {trustThreshold >= 0 && (
                <ReferenceLine
                  y={trustThreshold}
                  stroke="hsl(var(--chart-2, 38 92% 50%))"
                  strokeDasharray="4 4"
                />
              )}
              {suppressionThreshold >= 0 && (
                <ReferenceLine
                  y={suppressionThreshold}
                  stroke="hsl(var(--destructive))"
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
