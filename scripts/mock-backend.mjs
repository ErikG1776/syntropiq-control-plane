/**
 * Lightweight mock Syntropiq backend for docker-compose development.
 * Serves /api/v1/agents and /api/v1/statistics with synthetic data.
 */

import { createServer } from "node:http"

const AGENTS = [
  { agent_id: "sentinel-01", trust_score: 0.92, authority_weight: 0.8, status: "active", capabilities: ["monitoring", "alerting"] },
  { agent_id: "executor-02", trust_score: 0.85, authority_weight: 0.6, status: "active", capabilities: ["execution", "routing"] },
  { agent_id: "auditor-03", trust_score: 0.78, authority_weight: 0.5, status: "probation", capabilities: ["auditing", "compliance"] },
  { agent_id: "arbiter-04", trust_score: 0.95, authority_weight: 0.9, status: "active", capabilities: ["arbitration", "governance"] },
  { agent_id: "collector-05", trust_score: 0.65, authority_weight: 0.3, status: "active", capabilities: ["data_collection"] },
]

function jitter(base, range) {
  return Math.max(0, Math.min(1, base + (Math.random() - 0.5) * range))
}

function getAgents() {
  return AGENTS.map((a) => ({
    ...a,
    trust_score: jitter(a.trust_score, 0.08),
    last_decision_at: new Date().toISOString(),
  }))
}

function getStatistics() {
  return {
    total_agents: AGENTS.length,
    suppressed_count: AGENTS.filter((a) => a.status === "suppressed").length,
    thresholds: { trust_threshold: 0.6, suppression_threshold: 0.3, drift_delta: 0.15 },
    governance_cycles: Math.floor(Math.random() * 1000),
  }
}

const server = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json")
  res.setHeader("Access-Control-Allow-Origin", "*")

  if (req.url === "/api/v1/agents") {
    res.end(JSON.stringify(getAgents()))
  } else if (req.url === "/api/v1/statistics") {
    res.end(JSON.stringify(getStatistics()))
  } else {
    res.statusCode = 404
    res.end(JSON.stringify({ error: "Not found" }))
  }
})

server.listen(8000, "0.0.0.0", () => {
  console.log("Mock Syntropiq backend listening on :8000")
})
