# Composio AI Product Ops — 100-App Research & Verification Pipeline

Automated multi-pass research and verification pipeline evaluating **100 SaaS & developer apps across 10 categories** for AI agent integration feasibility (authentication, self-serve vs. gated access, REST/GraphQL/CLI surface, official MCP coverage, buildability verdict, and verified documentation evidence).

**Deliverable:** Open [`index.html`](./index.html) directly in any browser (zero build/server dependencies; embeds the full machine-readable JSON dataset in `<script id="composio-research-data" type="application/json">`).

---

## Architecture

1. **Pass 1 — Agent Synthesis (`src/agent/composio_mcp_agent.ts`)**
   - Uses `@composio/core` (`composio.sessions.create(userId, { mcp: true })` and `composio.toolkits.get(slug)`) alongside structured LLM extraction (`zod` schema in `src/schema.ts`).
   - Baseline semantic accuracy across all 100 apps: **75% (75/100)**.
2. **Pass 2 — Targeted Docs & MCP Verification Loop**
   - Narrow per-app & `site:` doc lookups resolving MCP endpoint availability, deprecated auth methods (e.g., HubSpot legacy API keys), and production review gates.
   - Lifted dataset accuracy from **75% -> 95%**.
3. **Pass 3 — Live HTTP URL Probe & 25-App Human Audit (`src/agent/verify_urls.ts`, `data/sample_audit_25.json`)**
   - Probes all 100 `evidence_url` endpoints live (`94` HTTP 2xx–3xx, `6` WAF/bot-gated portals, `0` dead 404s; caught and fixed 4 stale paths).
   - Risk-weighted 25-app human cross-check resolved brand collisions (`Paygent Connect`, `Waterfall.io`) and sandbox-vs-production gating (`WhatsApp Business`, `DealCloud`, `fanbasis`, `NotebookLM`).
   - Final confidence: **99/100 High Confidence**, with 1 app (`Paygent Connect`) explicitly flagged as `Low (Ambiguous)`.
4. **Pattern Engine & Self-Contained Report (`src/analysis/compute_patterns.ts`, `src/report/build_html.ts`)**
   - Aggregates all distributions, 10-category gating heatmaps, and Pass 1 -> Pass 3 deltas into `data/patterns_summary.json` and generates `index.html`.

---

## Quickstart

```bash
npm install

# 1. Re-verify all 100 evidence URLs live over HTTP -> data/url_checks.json
npm run verify:urls

# 2. Recompute pattern clusters & Pass 1 -> Pass 3 accuracy metrics
npm run verify:diff

# 3. Regenerate the single-file deliverable index.html
npm run build:report
```

### Optional: Run Live Pass 1 Agent with Composio Tool Router MCP

Copy `.env.example` to `.env` and set `COMPOSIO_API_KEY` + `OPENAI_API_KEY`:

```bash
cp .env.example .env
npx tsx src/agent/run_pipeline.ts --check-composio
npm run research:pass1
```

---

## Repository Files

- [`index.html`](./index.html) — Self-contained Case Study + interactive 100-app filterable matrix + embedded JSON payload.
- [`data/apps_input.json`](./data/apps_input.json) — Input 100 apps across 10 categories.
- [`data/apps_verified.json`](./data/apps_verified.json) — Verified 100-app dataset (Zod-validated).
- [`data/sample_audit_25.json`](./data/sample_audit_25.json) — 25-app risk-weighted human cross-check audit log.
- [`data/url_checks.json`](./data/url_checks.json) — Live HTTP probe results for all 100 evidence URLs.
- [`data/patterns_summary.json`](./data/patterns_summary.json) — Computed cluster statistics and accuracy progression.
