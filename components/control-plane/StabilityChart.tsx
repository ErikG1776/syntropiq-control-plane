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
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" tick={false} />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                dot={false}
                strokeWidth={2}
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
