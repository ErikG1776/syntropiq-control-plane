# Syntropiq Control Plane — Full Audit & Production Roadmap

_Generated 2026-02-23. Based on exhaustive codebase analysis of every source file._

---

## PART I: WHERE WE ARE (Honest Audit)

### Executive Summary

The repo has **sound architectural bones** — the datasource abstraction, canonical schema, Zustand store pattern, and adapter boundary are the right ideas. But we jumped into building UI pages and visualizations before the foundation was solid. The result: **6 pages that render, but a data layer that's ~50% real and a demo story that doesn't work**.

| Layer | Status | Grade |
|-------|--------|-------|
| Canonical schema (`schema.ts`) | Types defined, semantics undefined | B- |
| Datasource abstraction (`datasources/`) | Interface good, implementations incomplete | C+ |
| Normalization (`normalize.ts` + `route.ts`) | Defensive but inconsistent across files | C |
| Store (`governance-store.ts`) | Connection lifecycle solid, metrics broken | C+ |
| API adapter boundary (`api/control-plane/`) | Polling works, SSE missing, WS client-side only | C |
| UI components | Render correctly, limited interactivity | B |
| Pages/routes | 6 pages exist, no cross-filtering, no persistence | B- |
| Demo/replay data | **All 3 replay files are empty stubs** | F |
| Production readiness (auth, env config, errors) | Not started | F |

**Overall: 45% to a Palantir/Datadog-grade product.**

---

### What Actually Works

1. **Connection lifecycle** — Epoch-based Zustand store handles connect/disconnect/switch cleanly. Race conditions are handled.
2. **Live API polling** — `live_api` datasource polls `/api/control-plane/snapshot` every 2s, which proxies to `localhost:8000/api/v1/agents` + `/api/v1/statistics`. Works when backend is running.
3. **WebSocket connector** — `live_ws` has exponential backoff (1s→30s), heartbeat timeout (15s), localStorage URL override. Correctly structured.
4. **Normalization layer** — Handles snake_case/camelCase, multiple schema shapes, safe type coercion. Defensive and robust.
5. **UI rendering** — Dashboard, agent list, agent detail (with dual charts), event stream (with multi-field filtering), thresholds, executions all render. Dark mode. shadcn components.
6. **Agent detail drilldown** — `/agents/[id]` shows trust history chart, authority chart, status timeline, filtered events. The best page in the app.
7. **Event filtering** — Severity, type, agent, text search, time window (5m/15m/1h/all). Well-implemented.

### What's Broken or Fake

#### 1. Stability Metric Is Meaningless (CRITICAL)
```typescript
// store/governance-store.ts:102-108
const stability = payload.snapshot.agents.reduce(
  (acc, a) => acc + a.trustScore * a.authorityWeight, 0
)
```
This is a **weighted SUM**, not a stability metric. It grows with agent count, is not bounded 0-1, and doesn't reflect system health. The "Stability Over Time" chart and KPI card are showing a number that means nothing.

**What it should be:** Normalized weighted mean: `Σ(trustScore × authorityWeight) / Σ(authorityWeight)`, bounded 0-1, representing the system's aggregate governance health.

#### 2. Authority Weight Is Inconsistent Across Codebase
- `route.ts:107` — Falls back to `trustScore` when authority is missing
- `normalize.ts:103` — Falls back to `0` when authority is missing
- **These are two different files normalizing the same data differently.** The route adapter says "no authority = same as trust", the normalize layer says "no authority = zero weight". This means replay sources and live sources will compute stability differently.

#### 3. All Replay Data Files Are Empty Stubs
```json
// Every replay file:
{ "summary": {}, "timeline": [] }
```
Zero frames, zero agents, zero events. The replay engine code works correctly, but there's nothing to replay. **This means 3 of 5 datasources produce an empty dashboard.**

#### 4. No SSE Stream (Despite Being Referenced)
The ARCHITECTURE.md mentions `/api/control-plane/events/stream` for SSE. **This route does not exist.** The only streaming option is the client-side WebSocket. There is no server-proxied event stream.

#### 5. No Session Persistence
Every page refresh resets the store. The user must re-select a datasource, re-connect, and wait for data to accumulate. No `localStorage` backup, no "last used source" memory, no reconnect-on-mount.

#### 6. No Event Deduplication
Events are naively appended: `[...state.events, ...payload.events]`. If a datasource retransmits events (common in WS reconnect scenarios), duplicates appear in the UI. No ID-based dedup.

#### 7. Backend URL Is Hardcoded
`const BACKEND_BASE_URL = "http://localhost:8000"` — Not configurable via env vars. Will break in any deployment scenario. The WS URL at least supports env/localStorage override, but the REST adapter does not.

#### 8. HTTP 200 on All Errors
```typescript
// route.ts:206
return Response.json(unhealthyPayload(now), { status: 200 })
```
Success and failure both return 200. The UI has to check the `healthy` flag in the JSON body. This breaks standard HTTP error handling, monitoring, and load balancer health checks.

#### 9. No Mobile Responsiveness
The sidebar is a fixed `w-56` (224px). No hamburger menu, no collapse, no responsive breakpoint. Unusable below ~1024px.

#### 10. No Authentication or RBAC
Zero auth on any route. No API keys, no tokens, no middleware. The API adapter passes through to the backend unauthenticated.

---

### Codebase Health Snapshot

| Metric | Value |
|--------|-------|
| Source files (.ts/.tsx) | ~34 |
| Page routes | 6 |
| API routes | 2 (1 real adapter, 1 stub) |
| Components (domain) | 7 |
| Components (shadcn/ui) | 9 |
| Datasources defined | 5 (3 empty replays, 1 working poll, 1 untested WS) |
| Lines of source code | ~3,500 |
| Build status | Clean (Turbopack, no warnings) |
| Total commits | 3 |
| Test files | 0 |
| .env files | 0 |

---

## PART II: WHERE WE'RE GOING (Target Architecture)

### The Vision

A **backend-agnostic governance control plane** that can connect to:
- The Syntropiq Python framework (current)
- Any REST/WS/SSE/gRPC endpoint that speaks the canonical schema
- Future Rust governance engine
- Third-party agent frameworks (LangChain, CrewAI, AutoGen, etc.)

With the UX quality of Palantir Foundry or Datadog: real-time, drillable, cross-filtered, keyboard-navigable, production-grade.

### Architecture Layers (Target)

```
┌─────────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Overview  │ │ Agents   │ │ Events   │ │ Incidents│  ...more │
│  │ Dashboard │ │ Explorer │ │ Stream   │ │ Manager  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│  Cross-filtering bus / URL-synced filter state                  │
├─────────────────────────────────────────────────────────────────┤
│  STATE MANAGEMENT LAYER                                         │
│  ┌──────────────────────┐  ┌──────────────────┐                │
│  │ Governance Store     │  │ UI Preference     │               │
│  │ (Zustand)            │  │ Store (persisted) │               │
│  │ • snapshots          │  │ • selected source │               │
│  │ • events (deduped)   │  │ • filters         │               │
│  │ • derived metrics    │  │ • layout prefs    │               │
│  │ • connection state   │  │ • theme           │               │
│  └──────────────────────┘  └──────────────────┘                │
├─────────────────────────────────────────────────────────────────┤
│  DATA PIPELINE LAYER                                            │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────────────┐ │
│  │ Dedup   │→ │Normalize │→ │Validate │→ │ Backpressure     │ │
│  │ Engine  │  │ Pipeline │  │ + Alert │  │ Buffer           │ │
│  └─────────┘  └──────────┘  └─────────┘  └──────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  CONNECTOR LAYER (pluggable)                                    │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐ │
│  │ REST   │ │ WS     │ │ SSE    │ │ gRPC   │ │ Replay       │ │
│  │ Poll   │ │ Stream │ │ Stream │ │ Stream │ │ Engine       │ │
│  └────────┘ └────────┘ └────────┘ └────────┘ └──────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Adapter Registry (config-driven, env-aware, discoverable)│  │
│  └──────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  BACKEND BOUNDARY                                               │
│  ┌────────────────┐ ┌────────────────┐ ┌─────────────────────┐ │
│  │ Next.js API    │ │ Direct WS/SSE  │ │ Server Middleware    │ │
│  │ Proxy Routes   │ │ (client-side)  │ │ (auth, CORS, logs)  │ │
│  └────────────────┘ └────────────────┘ └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │                    │                     │
    Syntropiq Python     Rust Engine          Third-party APIs
    Framework            (future)             (any agent system)
```

---

## PART III: THE ROADMAP

### Phasing Strategy

We build **foundation before features, data before visualization**. Each phase produces a working, demoable product. No phase depends on a specific backend being available — replay data validates everything.

---

### PHASE 0: Foundation Reset (Get the Basics Right)
**Goal:** Fix every broken fundamental before adding anything new.
**Estimated scope:** ~15-20 files touched

#### 0.1 — Fix the Stability Metric
- Change store computation from SUM to normalized weighted mean
- `stability = Σ(trustScore × authorityWeight) / Σ(authorityWeight)` → bounded 0-1
- If no agents or all authority=0, stability = 0
- Update KpiRow display to show as percentage
- Update StabilityChart Y-axis label

#### 0.2 — Unify Authority Weight Semantics
- Single canonical rule across ALL normalizers: **missing authority = trustScore proxy**
- Fix `normalize.ts` line 103 to match `route.ts` line 107
- Document this in schema.ts with JSDoc comments
- Add unit-test-style comment explaining the contract

#### 0.3 — Environment Configuration
- Create `.env.example` with all config vars:
  ```
  NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
  NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/governance
  ```
- Replace hardcoded `BACKEND_BASE_URL` in `route.ts` with `process.env.BACKEND_URL`
- Ensure all URLs are configurable for any deployment target

#### 0.4 — Proper HTTP Error Codes
- Return 502 when backend is unreachable (not 200 with `healthy: false`)
- Return 503 when backend returns errors
- Keep 200 for success with `healthy: true/false` based on data quality
- UI polling handler: distinguish network error from unhealthy data

#### 0.5 — Session Persistence (localStorage)
- Persist `selectedSource` to localStorage on connect
- On app mount, auto-reconnect to last source (with user-visible indicator)
- Persist filter state (severity, type, agent, time window) per page
- Use Zustand `persist` middleware for the UI preference slice

#### 0.6 — Event Deduplication
- Maintain a `Set<string>` of event IDs in store (bounded, sliding window)
- On message: filter out events whose ID already exists
- Handle the case where events have no ID (generate deterministic hash from timestamp+type+agentId+message)

#### 0.7 — Populate Replay Data (Hero Demo)
Create one rich replay file (`replay_governance_demo.json`) with:
- 60 frames at ~800ms intervals (48 seconds of governance activity)
- 5 agents with distinct roles and trust trajectories
- Narrative arc: stable → drift detected → threshold breach → suppression → probation → redemption → stable
- All 9 event types represented
- Realistic timestamps, capabilities, labels
- This becomes the "hero demo" — the replay that always looks great

Replace one of the empty stubs (or add as new source). Keep empty stubs for future scenario-specific replays.

**Phase 0 Definition of Done:**
- Stability metric is bounded 0-1 and meaningful
- Authority weight is consistent everywhere
- All URLs configurable via .env
- Last source auto-reconnects on refresh
- Event dedup prevents duplicates
- One replay source produces a compelling 48-second demo
- Build clean, no regressions

---

### PHASE 1: Data Pipeline Hardening
**Goal:** The data layer is production-grade. Any backend, any speed, any failure mode.

#### 1.1 — Datasource Configuration Interface
```typescript
interface DataSourceConfig {
  key: string
  label: string
  mode: "replay" | "poll" | "stream"
  url?: string                    // configurable endpoint
  pollIntervalMs?: number         // for poll mode
  reconnect?: {
    initialMs: number
    maxMs: number
    multiplier: number
  }
  heartbeatTimeoutMs?: number     // for stream mode
  auth?: {
    type: "bearer" | "apikey" | "none"
    token?: string                // or reference to env var
  }
}
```
- Make every datasource fully configurable
- Support runtime registration of new sources (for "connect to any API" story)

#### 1.2 — Backpressure & Flow Control
- Add message queue with configurable depth (default 100)
- If queue exceeds threshold, drop oldest messages (log warning)
- Add `requestAnimationFrame`-gated store updates (don't update faster than 60fps)
- Track and expose: messages/sec, dropped messages, queue depth

#### 1.3 — Connection Health Metrics
- Track per-datasource: uptime, error count, latency (p50/p95/p99), messages received
- Expose via store selector for a future "connection health" panel
- Detect stale connections: if no message for N seconds AND mode is stream, show warning

#### 1.4 — Schema Validation Layer
- Add lightweight runtime validation for incoming payloads (not full Zod overhead — a focused validate function)
- Validate: agent IDs present, trustScore in [0,1], thresholds reasonable, timestamps parseable
- On validation failure: emit `system_alert` event to the UI event stream, don't crash
- Track validation failure rate as a metric

#### 1.5 — SSE Proxy Route
- Implement `app/api/control-plane/events/stream/route.ts`
- Proxy backend SSE at `/api/v1/events/stream` through Next.js
- Transform events to canonical schema on the fly
- Handle client disconnect (abort controller)
- Add as `live_sse` datasource option

#### 1.6 — Unified Normalization
- Consolidate `normalize.ts` functions + `route.ts` normalization into a single pipeline
- Single `normalizePayload(raw: unknown, source: DataSourceKey): GovernanceStreamPayload`
- Used by ALL connectors (replay, poll, WS, SSE)
- No more duplicated normalization logic in route.ts

**Phase 1 Definition of Done:**
- Any datasource can be configured at runtime with URL, auth, and tuning params
- High-frequency streams don't overwhelm the browser
- Connection health is tracked and queryable
- Invalid payloads don't crash the UI
- SSE streaming works end-to-end
- One normalization pipeline, used everywhere

---

### PHASE 2: UI Architecture Upgrade
**Goal:** From "pages that render" to "Datadog-level interactive dashboard."

#### 2.1 — Cross-Filtering Bus
- Implement a URL-synced filter context (using `nuqs` or custom `useSearchParams` wrapper)
- Filters: `agentId`, `severity`, `eventType`, `timeRange`, `status`
- All filter changes update URL → shareable, bookmarkable views
- Components subscribe to filter context and react
- Example: Click an agent in the registry → events page auto-filters to that agent

#### 2.2 — Time Range Picker
- Global time range selector in the TopBar: "Last 5m / 15m / 1h / 6h / 24h / Custom"
- All charts, event lists, and metrics respect the selected time range
- For replay: time range selects within the replay timeline
- For live: time range filters the buffered data

#### 2.3 — Responsive Layout
- Collapsible sidebar with hamburger menu on mobile (<1024px)
- Sidebar becomes a sheet (slide-over) on small screens
- Dashboard grid reorganizes: 1 column on mobile, 2 on tablet, full grid on desktop
- Touch-friendly controls (larger tap targets, swipe gestures for panels)

#### 2.4 — Loading / Error / Empty State System
- Skeleton loaders for every data-dependent component
- Error boundary with retry button and diagnostic info
- Empty states that guide the user: "No events yet. Connect a datasource to begin monitoring."
- Toast notification system for transient errors (connection lost, reconnecting, etc.)
- Use a shared `<DataGuard>` wrapper: handles connected/loading/error/empty for any panel

#### 2.5 — Command Palette (Keyboard Navigation)
- `Cmd+K` / `Ctrl+K` opens command palette
- Search: agents by ID, events by message, navigate to any page
- Quick actions: connect source, disconnect, switch theme, export
- Keyboard shortcuts for common navigation (G then A = go to agents, etc.)

#### 2.6 — Theme System
- Light/dark mode toggle (currently hardcoded dark)
- System preference detection (`prefers-color-scheme`)
- Persist preference to localStorage
- Ensure all charts use theme-aware colors (not hardcoded hex values)

**Phase 2 Definition of Done:**
- Click an agent anywhere → all views filter to that agent
- Time range picker controls all data views
- Works on mobile (sidebar collapses, grid adapts)
- Loading/error/empty states on every component
- Cmd+K command palette works
- Light and dark mode

---

### PHASE 3: Advanced Visualizations & Views
**Goal:** The views that make this feel like Palantir, not a homework project.

#### 3.1 — Agent Topology / Relationship Graph
- Interactive force-directed graph showing agent relationships
- Node size = authority weight, color = status, edge = shared capabilities/interactions
- Click node to drill into agent detail
- Useful for understanding governance topology at a glance
- Library: D3.js force simulation or `@xyflow/react`

#### 3.2 — Incident Timeline View
- Horizontal timeline showing governance "incidents" (suppressions, threshold breaches, routing freezes)
- Each incident is a colored span on the timeline
- Click to expand: shows the sequence of events that led to the incident
- Filters: by agent, by incident type, by severity
- This is the "what happened and when" view that ops teams live in

#### 3.3 — Trust Heatmap
- Matrix: agents (rows) × time buckets (columns)
- Cell color = trust score (green → red gradient)
- Instantly shows which agents are degrading and when
- Click cell to drill into that agent at that time

#### 3.4 — Governance Cycle Inspector
- Detailed view of individual governance cycles
- Shows: inputs (agent states), decisions made, outputs (new states), thresholds applied
- Side-by-side before/after for each agent in the cycle
- Decision audit trail: why was this agent suppressed? What threshold was breached?

#### 3.5 — Threshold Configuration UI
- Edit thresholds (trust, suppression, drift delta) from the UI
- Requires confirmation dialog with impact preview ("3 agents would be suppressed at this threshold")
- Audit log of all threshold changes
- Needs POST endpoint and RBAC (Phase 5 dependency)

#### 3.6 — Export & Reporting
- Export current view as CSV or JSON
- Export event stream with filters applied
- Screenshot/PDF of dashboard state
- Scheduled report generation (requires backend, Phase 5+)

**Phase 3 Definition of Done:**
- Agent topology graph renders with real-time data
- Incident timeline shows governance events as visual spans
- Trust heatmap provides at-a-glance agent health over time
- Governance cycles can be inspected in detail
- Any view can be exported

---

### PHASE 4: Multi-Backend & Protocol Support
**Goal:** Connect to anything. Syntropiq framework, Rust engine, third-party APIs.

#### 4.1 — Dynamic Datasource Registration
- UI form to add a new datasource at runtime: "Connect to Custom API"
- Fields: name, URL, protocol (REST poll / WebSocket / SSE), auth config, poll interval
- Saved to localStorage (and optionally to a config API)
- Supports the "connect to any system" story

#### 4.2 — Schema Adapter Framework
- Define adapter interface: `(rawPayload: unknown) => GovernanceStreamPayload | null`
- Ship built-in adapters:
  - Syntropiq Python framework (current canonical schema)
  - Syntropiq Rust engine (when available — likely same schema, possibly different transport)
  - Generic agent framework (maps `agent_id`, `score`, `state` to canonical)
- Allow users to provide custom adapter as a JSON mapping config
- Fall back to best-effort normalization (current `normalizePayload` logic)

#### 4.3 — gRPC-Web Support
- Add gRPC-web connector for future Rust engine
- Proxy through Next.js API route (gRPC-web → REST translation)
- Or direct gRPC-web from browser if engine exposes it

#### 4.4 — Multi-Source Composition
- Connect to multiple datasources simultaneously
- Merge/overlay agents from different sources
- Source tagging: see which backend each agent comes from
- Useful for: monitoring multiple deployments, comparing environments

#### 4.5 — Replay Scenario Library
- Build a library of replay scenarios:
  - `governance_demo`: Hero demo (from Phase 0)
  - `mass_suppression`: All agents get suppressed due to drift
  - `cascade_failure`: One agent failure triggers chain reaction
  - `redemption_arc`: Suppressed agent recovers and regains trust
  - `threshold_mutation`: Governance adapts thresholds mid-run
- Scenario builder tool (script or UI) to generate replay JSON from parameters

**Phase 4 Definition of Done:**
- Users can add custom API endpoints from the UI
- Built-in adapters for Syntropiq Python and Rust
- gRPC-web connector works
- Can monitor multiple backends simultaneously
- Library of replay scenarios for demos and testing

---

### PHASE 5: Production Hardening
**Goal:** Ship it. Auth, observability, performance, deployment.

#### 5.1 — Authentication & RBAC
- NextAuth.js (or Clerk) integration
- Roles: viewer (read-only), operator (connect/filter), admin (edit thresholds, manage sources)
- API route middleware for auth validation
- Session management with refresh tokens

#### 5.2 — Next.js Middleware
- Auth check on all routes
- CORS headers for API routes
- Rate limiting on polling endpoints
- Request logging with correlation IDs

#### 5.3 — Observability
- Structured logging (pino or winston)
- Performance metrics: page load time, time-to-first-data, chart render time
- Error tracking (Sentry or similar)
- Health check endpoint (`/api/health`) for load balancers

#### 5.4 — Performance Optimization
- Virtual scrolling for event lists (tanstack-virtual)
- Chart data downsampling for large histories (LTTB algorithm)
- React.memo and useMemo audit across all components
- Bundle analysis and code splitting
- Service worker for offline capability

#### 5.5 — Testing
- Unit tests for normalization pipeline (vitest)
- Unit tests for store logic (especially stability computation, dedup, trend detection)
- Integration tests for API routes (MSW for mocking backend)
- E2E tests for critical flows: connect → view data → filter → drilldown (Playwright)
- Visual regression tests for chart components

#### 5.6 — Deployment Configuration
- Dockerfile with multi-stage build
- Docker Compose with backend mock service
- CI/CD pipeline (GitHub Actions): lint → type-check → test → build → deploy
- Environment-specific configs (dev/staging/production)
- CDN configuration for static assets

**Phase 5 Definition of Done:**
- Auth protects all routes and API endpoints
- Structured logging and error tracking in production
- Sub-second page loads, 60fps chart updates
- Test coverage on normalization, store, and critical UI flows
- Docker image builds and deploys cleanly

---

## PART IV: IMMEDIATE DECISIONS

These need to be resolved before Phase 0 begins:

### Decision 1: Hero Demo Strategy
**Recommendation: Deterministic replay file (Option A)**

A hand-crafted `replay_governance_demo.json` that tells a clear 48-second story:
- 5 agents, each with a distinct arc
- Shows every governance action: trust update, probation, suppression, redemption, mutation, threshold breach
- Always works, no backend needed, predictable for investor/customer demos
- Can be used for E2E test validation

Later, add a "live fraud demo" option that connects to the real backend — but don't depend on it for first impressions.

### Decision 2: Stability Definition
**Recommendation: Normalized weighted mean**

```
stability = Σ(agent.trustScore × agent.authorityWeight) / Σ(agent.authorityWeight)
```

- Bounded 0-1
- Weighted by authority (high-authority agents matter more)
- Agents with zero authority don't skew the metric
- If all authority = 0 or no agents, stability = 0 (system has no governing capacity)

### Decision 3: Authority Weight Contract
**Recommendation: Missing authority = use trustScore as proxy**

- Consistent across all normalizers
- Rationale: An agent with no declared authority is "self-governing" — its influence should be proportional to its trustworthiness
- Document this in schema.ts
- Long term: require backend to always provide authorityWeight (make it non-optional)

### Decision 4: SSE vs WebSocket vs Both
**Recommendation: Both, with SSE as the default**

- SSE: simpler, works through proxies/CDNs, auto-reconnects natively, sufficient for most governance update rates
- WebSocket: for high-frequency scenarios (>10 updates/sec) or bidirectional needs (future task submission)
- Default the UI to SSE; offer WS as advanced option
- gRPC: Phase 4, when Rust engine is ready

---

## PART V: PHASE 0 IMPLEMENTATION CHECKLIST

Since Phase 0 is the immediate next step, here's the exact file-by-file work:

```
[ ] store/governance-store.ts
    - Fix stability computation (weighted mean, not sum)
    - Add event dedup (Set<string> of seen IDs)
    - Add Zustand persist middleware for UI prefs slice

[ ] lib/governance/schema.ts
    - Add JSDoc comments defining stability, authorityWeight semantics
    - Document threshold sentinel (-1) convention
    - Add schema version constant (export const SCHEMA_VERSION = "0.2.0")

[ ] lib/datasources/normalize.ts
    - Fix authorityWeight fallback: 0 → trustScore (match route.ts)
    - Extract shared normalizePayload() used by all connectors

[ ] app/api/control-plane/snapshot/route.ts
    - Replace hardcoded BACKEND_BASE_URL with process.env.BACKEND_URL
    - Return proper HTTP status codes (502/503 for backend failures)
    - Use shared normalizePayload() from normalize.ts

[ ] .env.example (NEW)
    - BACKEND_URL=http://localhost:8000
    - NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/governance

[ ] public/replays/replay_governance_demo.json (NEW)
    - 60 frames, 5 agents, full governance narrative
    - All 9 event types represented

[ ] lib/datasources/index.ts
    - Add replay_governance_demo source
    - Wire to new replay file

[ ] lib/governance/schema.ts
    - Add "replay_governance_demo" to DataSourceKey union

[ ] components/control-plane/KpiRow.tsx
    - Update stability display: show as percentage, explain formula in tooltip

[ ] components/control-plane/StabilityChart.tsx
    - Verify Y-axis domain is 0-1 (it already is, just confirming post-fix)
```

---

## PART VI: PRIORITY MAP

```
NOW (Phase 0)          NEXT (Phase 1-2)          LATER (Phase 3-5)
─────────────          ────────────────          ─────────────────
Fix stability metric   Datasource config UI      Agent topology graph
Unify authority logic  Backpressure handling      Incident timeline
.env configuration     SSE proxy route            Trust heatmap
HTTP error codes       Cross-filtering bus        Cycle inspector
Session persistence    Time range picker          Threshold editing
Event deduplication    Responsive layout          gRPC-web
Hero demo replay       Loading/error states       Multi-source composition
                       Command palette            Auth & RBAC
                       Theme toggle               Testing suite
                       Connection health metrics  Deployment pipeline
                       Unified normalization      Observability
```

---

## APPENDIX: Current File Inventory

```
app/
  layout.tsx                           # Root layout (dark mode forced)
  page.tsx                             # Redirect to /control-plane
  globals.css                          # Tailwind + theme vars
  api/
    control-plane/snapshot/route.ts    # Real backend adapter
    governance/snapshot/route.ts       # Stub (testing only)
  (control-plane)/
    layout.tsx                         # Sidebar + main area
    control-plane/page.tsx             # Dashboard
    agents/page.tsx                    # Agent list
    agents/[id]/page.tsx               # Agent detail
    events/page.tsx                    # Event stream
    thresholds/page.tsx                # Threshold view
    executions/page.tsx                # Governance cycles

components/
  control-plane/
    TopBar.tsx                         # Header with status badges
    KpiRow.tsx                         # 5-metric grid
    StabilityChart.tsx                 # Line chart with thresholds
    AgentRegistryPanel.tsx             # Agent table with sparklines
    EventStreamPanel.tsx               # Filterable event feed
    ConnectSourceDialog.tsx            # Source selector dialog
    SidebarNav.tsx                     # Navigation sidebar
  ui/                                  # 9 shadcn/ui components

lib/
  governance/schema.ts                 # Canonical types
  datasources/
    index.ts                           # Datasource registry
    types.ts                           # Datasource interface
    normalize.ts                       # Normalization pipeline
    replay.ts                          # Replay engine
    websocket.ts                       # WebSocket connector
  utils.ts                             # cn() utility

store/
  governance-store.ts                  # Zustand state management

public/replays/
  replay_infra_chain.json              # EMPTY STUB
  replay_readmission.json              # EMPTY STUB
  replay_finance.json                  # EMPTY STUB
```
