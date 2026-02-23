"use client"

import { useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeMouseHandler,
  Position,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Card } from "@/components/ui/card"
import { useGovernanceStore } from "@/store/governance-store"
import { useFilters } from "@/store/filter-store"

const STATUS_COLORS: Record<string, string> = {
  active: "#10b981",
  probation: "#f59e0b",
  suppressed: "#ef4444",
  unknown: "#6b7280",
}

export function AgentTopologyGraph() {
  const snapshot = useGovernanceStore((s) => s.snapshot)
  const agents = snapshot?.agents ?? []
  const router = useRouter()
  const filters = useFilters()

  const { nodes, edges } = useMemo(() => {
    if (agents.length === 0) return { nodes: [], edges: [] }

    // Layout agents in a circle
    const cx = 400
    const cy = 300
    const radius = Math.max(150, agents.length * 30)

    const nodes: Node[] = agents.map((agent, i) => {
      const angle = (2 * Math.PI * i) / agents.length - Math.PI / 2
      const x = cx + radius * Math.cos(angle)
      const y = cy + radius * Math.sin(angle)

      // Node size proportional to authority weight
      const size = 30 + agent.authorityWeight * 50

      return {
        id: agent.id,
        position: { x, y },
        data: {
          label: agent.id,
          trustScore: agent.trustScore,
          authorityWeight: agent.authorityWeight,
          status: agent.status,
          capabilities: agent.capabilities ?? [],
        },
        style: {
          width: size,
          height: size,
          borderRadius: "50%",
          background: STATUS_COLORS[agent.status] ?? STATUS_COLORS.unknown,
          border: `2px solid ${agent.trustScore < 0.5 ? "#ef4444" : "transparent"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "9px",
          color: "#fff",
          fontWeight: 600,
          padding: "4px",
          textAlign: "center" as const,
          overflow: "hidden",
          cursor: "pointer",
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      }
    })

    // Build edges based on shared capabilities
    const edges: Edge[] = []
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i]
        const b = agents[j]
        const shared = (a.capabilities ?? []).filter((c) =>
          (b.capabilities ?? []).includes(c),
        )
        if (shared.length > 0) {
          edges.push({
            id: `${a.id}-${b.id}`,
            source: a.id,
            target: b.id,
            animated: a.status === "active" && b.status === "active",
            style: {
              stroke:
                a.status === "suppressed" || b.status === "suppressed"
                  ? "#ef4444"
                  : "#6b728040",
              strokeWidth: Math.min(shared.length, 3),
            },
            label: shared.join(", "),
            labelStyle: { fontSize: 8, fill: "#9ca3af" },
          })
        }
      }
    }

    return { nodes, edges }
  }, [agents])

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      filters.setAgentId(node.id)
      router.push(`/agents/${node.id}`)
    },
    [filters, router],
  )

  if (agents.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">
          No agents to display. Connect a datasource to see the topology.
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="h-[600px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodeClick={onNodeClick}
          fitView
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(node) =>
              STATUS_COLORS[(node.data as { status: string }).status] ?? "#6b7280"
            }
            style={{ background: "hsl(var(--card))" }}
          />
        </ReactFlow>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-5 py-3 border-t text-xs">
        <span className="text-muted-foreground">Node size = authority weight</span>
        <span className="text-muted-foreground">Edges = shared capabilities</span>
        <div className="flex items-center gap-3 ml-auto">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ background: color }} />
              <span>{status}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
