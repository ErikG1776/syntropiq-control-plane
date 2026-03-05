"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts"

import { Card } from "@/components/ui/card"
import { useGovernanceStore } from "@/store/governance-store"

export function StabilityChart() {
  const history = useGovernanceStore((s) => s.stabilityHistory)

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-1">
        Stability Over Time
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Normalized weighted mean: &Sigma;(trust &times; authority) / &Sigma;(authority)
      </p>

      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Waiting for stability data...
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={history ?? []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => new Date(v).toLocaleTimeString()}
            />
            <YAxis domain={[0, 1]} />
            <Tooltip
              labelFormatter={(v) => new Date(v).toLocaleTimeString()}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
