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
  const thresholds = useGovernanceStore(
    (s) => s.snapshot?.thresholds
  )

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-4">
        Stability Over Time
      </h2>

      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Waiting for stability data...
        </p>
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="ts"
                tick={false}
              />
              <YAxis
                domain={[0, 1]}
              />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                dot={false}
                strokeWidth={2}
              />

              {thresholds && (
                <>
                  <ReferenceLine
                    y={thresholds.trustThreshold}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    y={thresholds.suppressionThreshold}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
