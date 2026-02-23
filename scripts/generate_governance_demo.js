#!/usr/bin/env node
/**
 * Generator for the Syntropiq Governance Control Plane hero demo replay.
 *
 * Produces 60 timeline frames (800ms apart) with 5 agents that each follow
 * a distinct narrative arc, plus rich governance events that tell the story.
 *
 * Output: public/replays/replay_governance_demo.json
 */

"use strict";

const fs = require("fs");
const path = require("path");

// --- constants ---------------------------------------------------------------

const FRAME_COUNT = 60;
const FRAME_INTERVAL_MS = 800;
const START_TIME = new Date("2026-02-23T10:00:00Z");

const DEFAULT_THRESHOLDS = {
  trustThreshold: 0.70,
  suppressionThreshold: 0.40,
  driftDelta: 0.08,
};

// --- helpers -----------------------------------------------------------------

function ts(frame) {
  return new Date(START_TIME.getTime() + frame * FRAME_INTERVAL_MS).toISOString();
}

function round(v, decimals) {
  decimals = decimals || 4;
  return Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function clamp(v, lo, hi) {
  lo = lo !== undefined ? lo : 0;
  hi = hi !== undefined ? hi : 1;
  return Math.min(hi, Math.max(lo, v));
}

/** Tiny deterministic jitter so trust lines are not perfectly straight */
function jitter(seed, magnitude) {
  magnitude = magnitude || 0.005;
  var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2 * magnitude;
}

var evtCounter = {};
function evtId(frame) {
  evtCounter[frame] = (evtCounter[frame] || 0) + 1;
  return "evt_demo_" + frame + "_" + evtCounter[frame];
}

function makeEvent(frame, overrides) {
  var base = {
    id: evtId(frame),
    timestamp: ts(frame),
    type: "heartbeat",
    severity: "info",
    message: "",
    tags: [],
  };
  var keys = Object.keys(overrides);
  for (var i = 0; i < keys.length; i++) {
    base[keys[i]] = overrides[keys[i]];
  }
  return base;
}

// --- agent arc calculators ---------------------------------------------------

function sentinelTrust(f) {
  return clamp(0.92 + jitter(f + 1000, 0.004));
}

function arbiterTrust(f) {
  if (f < 15) {
    return clamp(0.88 + jitter(f + 2000, 0.004));
  } else if (f < 30) {
    var decline = (f - 15) * 0.01;
    return clamp(0.88 - decline + jitter(f + 2000, 0.003));
  } else if (f < 35) {
    var base = 0.73 - (f - 30) * 0.004;
    return clamp(base + jitter(f + 2000, 0.002));
  } else if (f < 45) {
    var base2 = 0.71 + (f - 35) * 0.008;
    return clamp(base2 + jitter(f + 2000, 0.002));
  } else {
    var base3 = 0.79 + (f - 45) * 0.002;
    return clamp(Math.min(base3, 0.82) + jitter(f + 2000, 0.003));
  }
}

function collectorTrust(f) {
  if (f < 20) {
    return clamp(0.85 + jitter(f + 3000, 0.004));
  } else if (f < 22) {
    var drop = (f - 20) * 0.20;
    return clamp(0.85 - drop + jitter(f + 3000, 0.002));
  } else if (f === 22) {
    return 0.45;
  } else if (f < 41) {
    if (f === 23) return 0.38;
    return clamp(0.38 + jitter(f + 3000, 0.002));
  } else if (f < 50) {
    var base = 0.38 + (f - 41) * 0.019;
    return clamp(base + jitter(f + 3000, 0.002));
  } else {
    var base2 = 0.55 + (f - 50) * 0.013;
    return clamp(Math.min(base2, 0.68) + jitter(f + 3000, 0.003));
  }
}

function executorTrust(f) {
  return clamp(0.95 + jitter(f + 4000, 0.005));
}

function auditorTrust(f) {
  var base = 0.80 + (f / 60) * 0.04;
  return clamp(base + jitter(f + 5000, 0.004));
}

// --- agent status calculators ------------------------------------------------

function arbiterStatus(f) {
  if (f >= 30 && f < 45) return "probation";
  return "active";
}

function collectorStatus(f) {
  if (f >= 23 && f < 42) return "suppressed";
  if (f >= 42 && f < 50) return "probation";
  return "active";
}

// --- build agents for a frame ------------------------------------------------

function buildAgents(f) {
  return [
    {
      id: "agent_sentinel",
      trustScore: round(sentinelTrust(f)),
      authorityWeight: 0.85,
      status: "active",
      capabilities: ["monitoring", "alerting"],
      labels: { role: "sentinel", env: "production" },
    },
    {
      id: "agent_arbiter",
      trustScore: round(arbiterTrust(f)),
      authorityWeight: 0.90,
      status: arbiterStatus(f),
      capabilities: ["routing", "arbitration"],
      labels: { role: "arbiter", env: "production" },
    },
    {
      id: "agent_collector",
      trustScore: round(collectorTrust(f)),
      authorityWeight: 0.70,
      status: collectorStatus(f),
      capabilities: ["collection", "validation"],
      labels: { role: "collector", env: "production" },
    },
    {
      id: "agent_executor",
      trustScore: round(executorTrust(f)),
      authorityWeight: 0.95,
      status: "active",
      capabilities: ["execution", "scheduling"],
      labels: { role: "executor", env: "production", tier: "critical" },
    },
    {
      id: "agent_auditor",
      trustScore: round(auditorTrust(f)),
      authorityWeight: 0.60,
      status: "active",
      capabilities: ["auditing", "compliance"],
      labels: { role: "auditor", env: "production" },
    },
  ];
}

// --- build events for a frame ------------------------------------------------

function buildEvents(f, agents) {
  var events = [];

  var agentMap = {};
  for (var i = 0; i < agents.length; i++) {
    agentMap[agents[i].id] = agents[i];
  }

  // heartbeat every 5 frames
  if (f % 5 === 0) {
    events.push(
      makeEvent(f, {
        type: "heartbeat",
        severity: "info",
        message: "System heartbeat -- frame " + f + ". All governance loops nominal.",
        tags: ["heartbeat", "governance"],
      })
    );
  }

  // routine trust_updates in the calm opening (frames 1-14)
  if (f >= 1 && f <= 14) {
    var rotatingAgents = ["agent_sentinel", "agent_arbiter", "agent_collector", "agent_executor", "agent_auditor"];
    var pick = rotatingAgents[f % rotatingAgents.length];
    events.push(
      makeEvent(f, {
        type: "trust_update",
        severity: "info",
        message: "Routine trust evaluation for " + pick + ": score=" + agentMap[pick].trustScore,
        agentId: pick,
        tags: ["trust", "routine"],
      })
    );
  }

  // Frame 15: Auditor detects drift in Arbiter
  if (f === 15) {
    events.push(
      makeEvent(f, {
        type: "system_alert",
        severity: "warn",
        message: "Auditor-5 detected trust drift in Arbiter-3: routing decisions showing increasing deviation from consensus patterns.",
        agentId: "agent_auditor",
        tags: ["drift", "detection", "arbiter"],
      })
    );
  }

  // Frames 15-22: trust_updates showing Arbiter declining
  if (f >= 15 && f <= 22) {
    events.push(
      makeEvent(f, {
        type: "trust_update",
        severity: f >= 20 ? "warn" : "info",
        message: "Arbiter-3 trust declining: score=" + agentMap["agent_arbiter"].trustScore + " (threshold=0.70)",
        agentId: "agent_arbiter",
        tags: ["trust", "decline", "arbiter"],
      })
    );
  }

  // Frame 22: critical alert about Collector data corruption
  if (f === 22) {
    events.push(
      makeEvent(f, {
        type: "system_alert",
        severity: "critical",
        message: "CRITICAL: Collector-9 data corruption detected -- validation checksums failed on 3 consecutive payloads. Trust plummeted from 0.85 to 0.45.",
        agentId: "agent_collector",
        tags: ["corruption", "data-integrity", "collector", "critical"],
      })
    );
  }

  // Frame 23: suppression of Collector
  if (f === 23) {
    events.push(
      makeEvent(f, {
        type: "suppression",
        severity: "error",
        message: "Collector-9 suppressed: trust score 0.38 fell below suppression threshold (0.40). Agent removed from active routing.",
        agentId: "agent_collector",
        tags: ["suppression", "collector", "threshold"],
      })
    );
    events.push(
      makeEvent(f, {
        type: "status_change",
        severity: "error",
        message: "Collector-9 status changed: active -> suppressed",
        agentId: "agent_collector",
        tags: ["status", "suppressed", "collector"],
      })
    );
  }

  // Frame 25: threshold_breach from Auditor about Arbiter
  if (f === 25) {
    events.push(
      makeEvent(f, {
        type: "threshold_breach",
        severity: "warn",
        message: "Auditor-5 reports: Arbiter-3 approaching trust threshold (current=" + agentMap["agent_arbiter"].trustScore + ", threshold=0.70). Recommend increased monitoring.",
        agentId: "agent_auditor",
        tags: ["threshold", "arbiter", "warning"],
      })
    );
  }

  // Frames 23-29: continued Arbiter decline updates
  if (f > 22 && f < 30) {
    events.push(
      makeEvent(f, {
        type: "trust_update",
        severity: "warn",
        message: "Arbiter-3 trust continuing decline: score=" + agentMap["agent_arbiter"].trustScore,
        agentId: "agent_arbiter",
        tags: ["trust", "decline", "arbiter"],
      })
    );
  }

  // Frame 30: Arbiter enters probation
  if (f === 30) {
    events.push(
      makeEvent(f, {
        type: "probation",
        severity: "warn",
        message: "Arbiter-3 placed on probation: trust score " + agentMap["agent_arbiter"].trustScore + " breached threshold 0.70. Routing authority reduced.",
        agentId: "agent_arbiter",
        tags: ["probation", "arbiter", "threshold"],
      })
    );
    events.push(
      makeEvent(f, {
        type: "status_change",
        severity: "warn",
        message: "Arbiter-3 status changed: active -> probation",
        agentId: "agent_arbiter",
        tags: ["status", "probation", "arbiter"],
      })
    );
  }

  // Frame 35: Arbiter recovery begins
  if (f === 35) {
    events.push(
      makeEvent(f, {
        type: "trust_update",
        severity: "info",
        message: "Arbiter-3 showing recovery signals: trust=" + agentMap["agent_arbiter"].trustScore + ". Routing recalibration in effect.",
        agentId: "agent_arbiter",
        tags: ["trust", "recovery", "arbiter"],
      })
    );
  }

  // Frame 38: mutation -- system adapts driftDelta
  if (f === 38) {
    events.push(
      makeEvent(f, {
        type: "mutation",
        severity: "warn",
        message: "Governance mutation: driftDelta threshold tightened from 0.08 to 0.06. System adapting to recent instability in Arbiter-3 and Collector-9.",
        tags: ["mutation", "threshold", "adaptation", "governance"],
      })
    );
  }

  // Frame 40: routing_freeze + Auditor threshold_breach
  if (f === 40) {
    events.push(
      makeEvent(f, {
        type: "routing_freeze",
        severity: "warn",
        message: "Temporary routing freeze enacted: stability concerns due to prolonged Collector-9 suppression and Arbiter-3 probation. Re-evaluation in progress.",
        tags: ["routing", "freeze", "stability"],
      })
    );
    events.push(
      makeEvent(f, {
        type: "threshold_breach",
        severity: "warn",
        message: "Auditor-5 threshold breach alert: prolonged suppression of Collector-9 (17 frames) impacting system data pipeline stability.",
        agentId: "agent_auditor",
        tags: ["threshold", "collector", "stability", "prolonged"],
      })
    );
  }

  // Frame 41: Collector recovery begins
  if (f === 41) {
    events.push(
      makeEvent(f, {
        type: "trust_update",
        severity: "info",
        message: "Collector-9 recovery initiated: trust climbing from 0.38. Data validation modules reloaded.",
        agentId: "agent_collector",
        tags: ["trust", "recovery", "collector"],
      })
    );
  }

  // Frame 42: Collector suppressed -> probation
  if (f === 42) {
    events.push(
      makeEvent(f, {
        type: "status_change",
        severity: "info",
        message: "Collector-9 status changed: suppressed -> probation. Trust=" + agentMap["agent_collector"].trustScore + ". Limited data collection resumed.",
        agentId: "agent_collector",
        tags: ["status", "probation", "collector", "recovery"],
      })
    );
  }

  // Frame 45: Arbiter probation -> active
  if (f === 45) {
    events.push(
      makeEvent(f, {
        type: "status_change",
        severity: "info",
        message: "Arbiter-3 status changed: probation -> active. Trust=" + agentMap["agent_arbiter"].trustScore + " now above threshold. Full routing authority restored.",
        agentId: "agent_arbiter",
        tags: ["status", "active", "arbiter", "recovery"],
      })
    );
  }

  // Frame 50: Collector probation -> active
  if (f === 50) {
    events.push(
      makeEvent(f, {
        type: "status_change",
        severity: "info",
        message: "Collector-9 status changed: probation -> active. Trust=" + agentMap["agent_collector"].trustScore + ". Full data collection privileges restored.",
        agentId: "agent_collector",
        tags: ["status", "active", "collector", "recovery"],
      })
    );
  }

  // Frames 50-59: stability trust_updates
  if (f >= 50 && f <= 59) {
    var rotAgents = ["agent_sentinel", "agent_arbiter", "agent_collector", "agent_executor", "agent_auditor"];
    var pick2 = rotAgents[f % rotAgents.length];
    events.push(
      makeEvent(f, {
        type: "trust_update",
        severity: "info",
        message: "System stabilizing -- " + pick2 + " trust=" + agentMap[pick2].trustScore,
        agentId: pick2,
        tags: ["trust", "stability", "recovery"],
      })
    );
  }

  // Periodic trust snapshots during turbulence (frames 30-49)
  if (f >= 30 && f < 50 && f % 3 === 0) {
    events.push(
      makeEvent(f, {
        type: "trust_update",
        severity: "info",
        message: "Periodic trust snapshot -- Sentinel=" + agentMap["agent_sentinel"].trustScore + ", Executor=" + agentMap["agent_executor"].trustScore,
        tags: ["trust", "snapshot"],
      })
    );
  }

  return events;
}

// --- main generation ---------------------------------------------------------

function generate() {
  var timeline = [];

  for (var f = 0; f < FRAME_COUNT; f++) {
    var agents = buildAgents(f);
    var events = buildEvents(f, agents);

    var thresholds;
    if (f >= 38) {
      thresholds = { trustThreshold: 0.70, suppressionThreshold: 0.40, driftDelta: 0.06 };
    } else {
      thresholds = { trustThreshold: DEFAULT_THRESHOLDS.trustThreshold, suppressionThreshold: DEFAULT_THRESHOLDS.suppressionThreshold, driftDelta: DEFAULT_THRESHOLDS.driftDelta };
    }

    timeline.push({
      agents: agents,
      events: events,
      timestamp: ts(f),
      thresholds: thresholds,
    });
  }

  var summary = {
    title: "Governance Control Plane -- Hero Demo",
    description: "A 60-frame replay demonstrating trust drift, suppression, probation, mutation, and recovery across five governance agents in the Syntropiq control plane.",
    frameCount: FRAME_COUNT,
    frameIntervalMs: FRAME_INTERVAL_MS,
    startTime: START_TIME.toISOString(),
    endTime: ts(FRAME_COUNT - 1),
    agents: [
      { id: "agent_sentinel", name: "Sentinel-7", role: "Monitoring specialist" },
      { id: "agent_arbiter", name: "Arbiter-3", role: "Decision arbiter" },
      { id: "agent_collector", name: "Collector-9", role: "Data collector" },
      { id: "agent_executor", name: "Executor-1", role: "Task executor" },
      { id: "agent_auditor", name: "Auditor-5", role: "Compliance auditor" },
    ],
    keyEvents: [
      "Frame 15: Drift detected in Arbiter-3",
      "Frame 22: Collector-9 data corruption (critical)",
      "Frame 23: Collector-9 suppressed",
      "Frame 30: Arbiter-3 enters probation",
      "Frame 38: Governance mutation -- driftDelta tightened",
      "Frame 40: Routing freeze + Auditor threshold breach alert",
      "Frame 42: Collector-9 enters probation (recovery)",
      "Frame 45: Arbiter-3 restored to active",
      "Frame 50: Collector-9 restored to active",
    ],
  };

  return { summary: summary, timeline: timeline };
}

// --- write output ------------------------------------------------------------

var output = generate();
var outPath = path.resolve(__dirname, "../public/replays/replay_governance_demo.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

// --- verification ------------------------------------------------------------

console.log("=== Governance Demo Replay Generated ===");
console.log("Output: " + outPath);
console.log("Timeline frames: " + output.timeline.length);
console.log();

var first = output.timeline[0];
var last = output.timeline[output.timeline.length - 1];

console.log("--- Frame 0 (first) ---");
console.log("  Timestamp: " + first.timestamp);
console.log("  Thresholds: " + JSON.stringify(first.thresholds));
first.agents.forEach(function(a) {
  console.log("  " + a.id + ": trust=" + a.trustScore + ", authority=" + a.authorityWeight + ", status=" + a.status);
});
console.log("  Events: " + first.events.length);

console.log();
console.log("--- Frame 59 (last) ---");
console.log("  Timestamp: " + last.timestamp);
console.log("  Thresholds: " + JSON.stringify(last.thresholds));
last.agents.forEach(function(a) {
  console.log("  " + a.id + ": trust=" + a.trustScore + ", authority=" + a.authorityWeight + ", status=" + a.status);
});
console.log("  Events: " + last.events.length);

// Quick sanity checks
var totalEvents = output.timeline.reduce(function(sum, f) { return sum + f.events.length; }, 0);
console.log("\nTotal events across all frames: " + totalEvents);

// Verify unique event IDs
var allIds = [];
output.timeline.forEach(function(f) {
  f.events.forEach(function(e) {
    allIds.push(e.id);
  });
});
var uniqueSet = {};
allIds.forEach(function(id) { uniqueSet[id] = true; });
var uniqueCount = Object.keys(uniqueSet).length;
console.log("Unique event IDs: " + uniqueCount + " / " + allIds.length + " (" + (uniqueCount === allIds.length ? "OK" : "DUPLICATES FOUND") + ")");

// Verify key narrative beats
var frame22 = output.timeline[22];
var collector22 = frame22.agents.filter(function(a) { return a.id === "agent_collector"; })[0];
console.log("\nFrame 22 Collector trust: " + collector22.trustScore + " (expect ~0.45)");

var frame23 = output.timeline[23];
var collector23 = frame23.agents.filter(function(a) { return a.id === "agent_collector"; })[0];
console.log("Frame 23 Collector trust: " + collector23.trustScore + " (expect ~0.38), status: " + collector23.status + " (expect suppressed)");

var frame30 = output.timeline[30];
var arbiter30 = frame30.agents.filter(function(a) { return a.id === "agent_arbiter"; })[0];
console.log("Frame 30 Arbiter trust: " + arbiter30.trustScore + ", status: " + arbiter30.status + " (expect probation)");

var frame38 = output.timeline[38];
console.log("Frame 38 thresholds: " + JSON.stringify(frame38.thresholds) + " (expect driftDelta=0.06)");

var frame45 = output.timeline[45];
var arbiter45 = frame45.agents.filter(function(a) { return a.id === "agent_arbiter"; })[0];
console.log("Frame 45 Arbiter trust: " + arbiter45.trustScore + ", status: " + arbiter45.status + " (expect active)");

var frame50 = output.timeline[50];
var collector50 = frame50.agents.filter(function(a) { return a.id === "agent_collector"; })[0];
console.log("Frame 50 Collector trust: " + collector50.trustScore + ", status: " + collector50.status + " (expect active)");
