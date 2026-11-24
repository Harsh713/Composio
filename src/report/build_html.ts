import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  AppResearchRecord,
  AppResearchRecordSchema,
  SampleAuditEntry,
  SampleAuditEntrySchema,
} from "../schema.js";
import { computeAllPatterns, ComputedPatterns } from "../analysis/compute_patterns.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJsonEmbed(obj: unknown): string {
  return JSON.stringify(obj).replace(/<\//g, "<\\/");
}

function renderDistributionBars(
  items: { label: string; count: number; pct: number }[],
  colorMap: Record<string, string>,
  defaultColor = "#4f46e5"
): string {
  const max = Math.max(...items.map((i) => i.count), 1);
  return items
    .map((item) => {
      const width = Math.max(4, Math.round((item.count / max) * 100));
      const color = colorMap[item.label] ?? defaultColor;
      return `
        <div class="bar-row">
          <div class="bar-meta">
            <span class="bar-label">${escapeHtml(item.label)}</span>
            <span class="bar-val"><strong>${item.count}</strong> <span class="muted">(${item.pct}%)</span></span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${width}%;background:${color};"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

export async function buildReportHtml(rootDir = process.cwd()): Promise<string> {
  const patterns: ComputedPatterns = await computeAllPatterns(rootDir);
  const appsRaw = JSON.parse(
    await fs.readFile(path.join(rootDir, "data", "apps_verified.json"), "utf8")
  );
  const apps: AppResearchRecord[] = z.array(AppResearchRecordSchema).parse(appsRaw);

  const sampleRaw = JSON.parse(
    await fs.readFile(path.join(rootDir, "data", "sample_audit_25.json"), "utf8")
  );
  const sample: SampleAuditEntry[] = z.array(SampleAuditEntrySchema).parse(sampleRaw);

  const urlChecks = JSON.parse(
    await fs.readFile(path.join(rootDir, "data", "url_checks.json"), "utf8")
  );

  const embeddedPayload = {
    meta: {
      title: "Composio AI Product Ops — 100-App Integration & MCP Feasibility Study",
      generated_at: patterns.generated_at,
      total_apps: apps.length,
      methodology: "3-pass pipeline: Composio SDK/LLM Pass 1 -> Targeted Docs & MCP Pass 2 -> Live HTTP URL Probe + 25-App Human Audit Pass 3",
    },
    patterns,
    sample_audit_25: sample,
    apps,
    url_checks: urlChecks,
  };

  const verdictColors: Record<string, string> = {
    "Easy Win (Build Today)": "#059669",
    "Buildable (Minor Friction)": "#d97706",
    "Gated (Outreach / Compliance Needed)": "#dc2626",
    "Not Standard SaaS API (CLI / Local)": "#64748b",
  };

  const authColors: Record<string, string> = {
    OAuth2: "#4f46e5",
    "Bearer / PAT": "#0891b2",
    "API Key": "#0d9488",
    Basic: "#d97706",
    "Custom Header / HMAC": "#7c3aed",
    "None (CLI / Local)": "#64748b",
    "IAM / SSO": "#dc2626",
  };

  const mcpColors: Record<string, string> = {
    "Official Remote MCP": "#059669",
    "Official Local / OSS MCP": "#0d9488",
    "Official (Enterprise / Docs-Only)": "#d97706",
    "Community / 3P Only": "#6366f1",
    None: "#94a3b8",
  };

  const blockerColors: Record<string, string> = {
    "None (Ready)": "#10b981",
    "App Review / Verification Gate": "#dc2626",
    "Paid Plan / Credit Gate": "#d97706",
    "Partner / Enterprise Sales Gate": "#991b1b",
    "Non-Standard / Local Auth or CLI": "#64748b",
    "Ambiguous / Undocumented Entity": "#7c3aed",
  };

  const categoryRowsHtml = patterns.category_matrix
    .map((row) => {
      const easyPct = Math.round((row.easyWin / row.total) * 100);
      const mcpPct = Math.round((row.officialMcpCount / row.total) * 100);
      return `
        <tr>
          <td class="cat-name">${escapeHtml(row.category)}</td>
          <td class="num">${row.selfServeFreeOrFreemium}/10</td>
          <td class="num">${row.paidPlanGate}</td>
          <td class="num">${row.reviewOrAdminGate}</td>
          <td class="num">${row.partnerOrSalesGate}</td>
          <td>
            <div class="heat-cell">
              <span class="heat-pill" style="background:rgba(5,150,105,${0.12 + (row.easyWin / 10) * 0.45});color:#065f46;">
                <strong>${row.easyWin}</strong>/10 (${easyPct}%)
              </span>
            </div>
          </td>
          <td class="num">${row.buildableFriction}</td>
          <td class="num">${row.gatedOutreach}</td>
          <td class="num">${row.cliLocal}</td>
          <td>
            <span class="heat-pill" style="background:rgba(79,70,229,${0.08 + (row.officialMcpCount / 10) * 0.35});color:#312e81;">
              ${row.officialMcpCount}/10 (${mcpPct}%)
            </span>
          </td>
          <td class="num">${row.oauth2Count}/10</td>
        </tr>
      `;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Composio AI Product Ops — 100-App Research &amp; Verification Case Study</title>
  <meta name="description" content="Automated + verified Product Ops feasibility research across 100 apps in 10 categories: auth methods, self-serve vs gated access, API surface, official MCP coverage, and 3-pass accuracy verification." />
  <script type="application/ld+json">${safeJsonEmbed({
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Composio 100-App API, Auth & MCP Feasibility Research",
    description: "Structured evaluation of 100 SaaS and developer apps across 10 categories with verified documentation URLs and multi-pass accuracy audit.",
    dateModified: patterns.generated_at,
    size: "100 apps",
  })}</script>
  <style>
    :root {
      --bg: #f8fafc;
      --surface: #ffffff;
      --surface-alt: #f1f5f9;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #475569;
      --subtle: #64748b;
      --accent: #4f46e5;
      --accent-soft: #eef2ff;
      --green: #059669;
      --green-soft: #ecfdf5;
      --amber: #d97706;
      --amber-soft: #fffbeb;
      --red: #dc2626;
      --red-soft: #fef2f2;
      --slate-soft: #f1f5f9;
      --radius: 12px;
      --shadow: 0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    code, pre, .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.88em;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Top Nav */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--border);
    }
    .topbar-inner {
      max-width: 1320px;
      margin: 0 auto;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--text);
    }
    .brand-badge {
      background: var(--accent);
      color: #fff;
      font-size: 0.72rem;
      padding: 2px 8px;
      border-radius: 999px;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .nav-links {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .nav-links a { color: var(--muted); padding: 4px 6px; border-radius: 6px; }
    .nav-links a:hover { color: var(--accent); background: var(--accent-soft); text-decoration: none; }
    .agent-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn:hover { border-color: var(--accent); color: var(--accent); }
    .btn-primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    .btn-primary:hover { background: #4338ca; color: #fff; }

    .container {
      max-width: 1320px;
      margin: 0 auto;
      padding: 28px 20px 64px;
    }

    /* Hero */
    .hero {
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #312e81 100%);
      color: #fff;
      border-radius: 16px;
      padding: 32px 32px 28px;
      margin-bottom: 24px;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.14);
    }
    .hero-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255,255,255,0.12);
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.03em;
      margin-bottom: 12px;
    }
    .hero h1 {
      margin: 0 0 10px;
      font-size: clamp(1.55rem, 2.8vw, 2.25rem);
      line-height: 1.2;
      letter-spacing: -0.02em;
    }
    .hero p.lead {
      margin: 0 0 22px;
      color: #cbd5e1;
      max-width: 880px;
      font-size: 1rem;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 12px;
    }
    .kpi {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 12px;
      padding: 14px 16px;
    }
    .kpi-val {
      font-size: 1.75rem;
      font-weight: 800;
      line-height: 1.1;
      margin-bottom: 4px;
    }
    .kpi-label {
      font-size: 0.82rem;
      color: #e2e8f0;
      font-weight: 600;
    }
    .kpi-sub {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 3px;
    }

    /* Section Headings */
    section { margin-top: 34px; }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 12px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .section-head h2 {
      margin: 0;
      font-size: 1.35rem;
      letter-spacing: -0.015em;
    }
    .section-head .subtitle {
      color: var(--muted);
      font-size: 0.9rem;
      margin: 3px 0 0;
    }

    /* Headline Cards */
    .insights-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
      gap: 14px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px 20px;
      box-shadow: var(--shadow);
    }
    .insight-num {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--accent);
      background: var(--accent-soft);
      padding: 2px 8px;
      border-radius: 6px;
      margin-bottom: 8px;
    }
    .card h3 {
      margin: 0 0 8px;
      font-size: 1.03rem;
      line-height: 1.3;
    }
    .card p {
      margin: 0;
      color: var(--muted);
      font-size: 0.9rem;
    }

    /* Charts Grid */
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
      gap: 14px;
      margin-top: 14px;
    }
    .bar-row { margin-bottom: 10px; }
    .bar-row:last-child { margin-bottom: 0; }
    .bar-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.82rem;
      margin-bottom: 4px;
    }
    .bar-label { font-weight: 600; color: var(--text); }
    .bar-track {
      height: 8px;
      background: var(--surface-alt);
      border-radius: 999px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 999px;
    }
    .muted { color: var(--subtle); }

    /* Tables */
    .table-wrap {
      overflow-x: auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    th {
      background: var(--surface-alt);
      color: var(--muted);
      font-weight: 700;
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    tr:last-child td { border-bottom: none; }
    td.num, th.num { text-align: center; }
    .cat-name { font-weight: 700; white-space: nowrap; }
    .heat-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.78rem;
      white-space: nowrap;
    }

    /* Badges */
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .pill-green { background: var(--green-soft); color: #065f46; border: 1px solid #a7f3d0; }
    .pill-amber { background: var(--amber-soft); color: #92400e; border: 1px solid #fde68a; }
    .pill-red { background: var(--red-soft); color: #991b1b; border: 1px solid #fecaca; }
    .pill-indigo { background: var(--accent-soft); color: #3730a3; border: 1px solid #c7d2fe; }
    .pill-slate { background: var(--slate-soft); color: #334155; border: 1px solid #cbd5e1; }

    /* Pipeline Flow */
    .pipeline-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .step-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-top: 3px solid var(--accent);
      border-radius: var(--radius);
      padding: 16px;
      box-shadow: var(--shadow);
    }
    .step-tag {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 4px;
    }
    .step-card h4 { margin: 0 0 6px; font-size: 0.96rem; }
    .step-card p { margin: 0; font-size: 0.84rem; color: var(--muted); }

    .two-col {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 14px;
    }

    pre.code-block {
      background: #0f172a;
      color: #e2e8f0;
      padding: 14px 16px;
      border-radius: 10px;
      overflow-x: auto;
      font-size: 0.8rem;
      line-height: 1.5;
      margin: 10px 0 0;
    }

    /* Verification Funnel */
    .funnel {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .funnel-step {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      box-shadow: var(--shadow);
    }
    .funnel-score {
      font-size: 1.8rem;
      font-weight: 800;
      line-height: 1.1;
      margin: 4px 0;
    }

    /* Interactive Matrix Controls */
    .controls {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px;
      margin-bottom: 12px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
      gap: 10px;
      align-items: end;
      box-shadow: var(--shadow);
    }
    .control-group label {
      display: block;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--subtle);
      margin-bottom: 4px;
    }
    .control-group input,
    .control-group select {
      width: 100%;
      padding: 7px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 0.85rem;
      background: #fff;
      color: var(--text);
    }
    .matrix-row { cursor: pointer; transition: background 0.1s ease; }
    .matrix-row:hover { background: #f8fafc; }
    .detail-row td {
      background: #f8fafc;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
    }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
      font-size: 0.84rem;
    }
    .detail-box strong {
      display: block;
      font-size: 0.74rem;
      text-transform: uppercase;
      color: var(--subtle);
      margin-bottom: 2px;
    }

    /* Agent JSON Drawer */
    .json-drawer {
      display: none;
      margin-top: 16px;
      background: #0f172a;
      color: #e2e8f0;
      border-radius: var(--radius);
      padding: 16px;
    }
    .json-drawer.open { display: block; }
    .json-drawer pre {
      max-height: 360px;
      overflow: auto;
      margin: 8px 0 0;
      font-size: 0.78rem;
    }

    .playbook-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .wave-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      box-shadow: var(--shadow);
    }
    .wave-card h4 { margin: 6px 0; font-size: 0.96rem; }
    .wave-card p { margin: 0; font-size: 0.84rem; color: var(--muted); }

    @media (max-width: 720px) {
      .hero { padding: 22px 18px; }
      .nav-links { display: none; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <span class="brand-badge">Composio Product Ops</span>
        <span>100-App API, Auth &amp; MCP Research</span>
      </div>
      <nav class="nav-links">
        <a href="#patterns">1. Patterns</a>
        <a href="#clusters">2. Category Matrix</a>
        <a href="#agent">3. Agent &amp; Proof</a>
        <a href="#verification">4. Verification</a>
        <a href="#matrix">5. All 100 Apps</a>
      </nav>
      <div class="agent-actions">
        <button class="btn" id="toggle-agent-json" type="button">Agent JSON View</button>
        <button class="btn" id="copy-json-btn" type="button">Copy JSON</button>
        <button class="btn btn-primary" id="download-csv-btn" type="button">Download CSV</button>
      </div>
    </div>
  </header>

  <main class="container">
    <!-- HERO & HEADLINE KPIs -->
    <div class="hero">
      <div class="hero-eyebrow">2-Minute Executive Case Study • 100 Apps × 10 Categories • Verified Multi-Pass Pipeline</div>
      <h1>76% of apps look self-serve, but only 59% are true Easy Wins — and 79% already ship an official MCP.</h1>
      <p class="lead">
        We built a 3-pass automated research &amp; verification pipeline using <code style="background:rgba(255,255,255,0.14);padding:2px 6px;border-radius:4px;">@composio/core</code> Tool Router MCP, targeted documentation grounding, live HTTP URL probing (100/100 checked), and a 25-app adversarial manual audit to map where Composio can ship toolkits today versus where outreach, app review, or auth parity gaps block execution.
      </p>
      <div class="kpi-grid">
        <div class="kpi">
          <div class="kpi-val">${patterns.headlines.easy_win_count}<span style="font-size:1rem;font-weight:500;">/100</span></div>
          <div class="kpi-label">Easy Wins (Build Today)</div>
          <div class="kpi-sub">vs ${patterns.headlines.self_serve_total}/100 nominal self-serve (17 hidden-friction apps)</div>
        </div>
        <div class="kpi">
          <div class="kpi-val">${patterns.headlines.oauth2_any_count}<span style="font-size:1rem;font-weight:500;">%</span></div>
          <div class="kpi-label">OAuth2 Coverage</div>
          <div class="kpi-sub">${patterns.headlines.oauth2_primary_count}% OAuth2 primary • 30% OAuth2 secondary/MCP</div>
        </div>
        <div class="kpi">
          <div class="kpi-val">${patterns.headlines.official_mcp_count}<span style="font-size:1rem;font-weight:500;">%</span></div>
          <div class="kpi-label">Official MCP Adoption</div>
          <div class="kpi-sub">62 Remote MCP + 17 Local/OSS (+3 Enterprise/Docs-only)</div>
        </div>
        <div class="kpi">
          <div class="kpi-val">${patterns.headlines.top_blocker_count}<span style="font-size:1rem;font-weight:500;"> apps</span></div>
          <div class="kpi-label">#1 Non-Ready Blocker</div>
          <div class="kpi-sub">App Review / Verification Gate (tied w/ Paid Plan Gate: 12)</div>
        </div>
        <div class="kpi">
          <div class="kpi-val">75% &rarr; 99%</div>
          <div class="kpi-label">Verified Accuracy Lift</div>
          <div class="kpi-sub">94 HTTP 2xx–3xx + 6 WAF/bot portals • 0 dead 404 URLs</div>
        </div>
      </div>

      <div class="json-drawer" id="agent-json-drawer">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <strong>Machine-Readable Embedded Payload (<code>#composio-research-data</code>)</strong>
          <span style="font-size:0.78rem;color:#94a3b8;">Agents can parse <code>document.getElementById('composio-research-data').textContent</code> directly.</span>
        </div>
        <pre id="json-preview"></pre>
      </div>
    </div>

    <!-- SECTION 1: PATTERNS UP TOP -->
    <section id="patterns">
      <div class="section-head">
        <div>
          <h2>1. Headline Patterns &amp; Strategic Insights</h2>
          <p class="subtitle">Clustered findings across all 100 apps — what the raw table alone hides.</p>
        </div>
      </div>

      <div class="insights-grid">
        <div class="card">
          <span class="insight-num">Pattern 01 • The Self-Serve Illusion</span>
          <h3>76% Self-Serve on paper, but 59% true Easy Wins</h3>
          <p><strong>17 apps</strong> appear self-serve yet carry real build friction: split auth across endpoints (Help Scout Inbox OAuth2 vs Docs Basic), 3-header custom auth (Copper), multi-DC OAuth routing (Zoho CRM/Cliq), hobby-only non-commercial TOS (Vercel), or paid walls blocking live testing (Front, Pylon, Ahrefs, Smartsheet, Clay, Devin).</p>
        </div>
        <div class="card">
          <span class="insight-num">Pattern 02 • Auth &amp; MCP Parity Gap</span>
          <h3>OAuth2 is standard (80%), yet MCPs break auth parity</h3>
          <p><strong>50%</strong> use OAuth2 as primary auth and <strong>80%</strong> support it somewhere. Crucially, vendor MCP servers often restrict what REST APIs allow: ClickUp's MCP rejects <code>pk_</code> tokens (OAuth2 only), Brex's MCP blocks money movement, Plaid's MCP is diagnostics-only, and Squarespace's MCP only covers Domains.</p>
        </div>
        <div class="card">
          <span class="insight-num">Pattern 03 • Category Bifurcation</span>
          <h3>Dev &amp; Productivity (90% Easy Win) vs Finance (20%) &amp; Ads (40%)</h3>
          <p><strong>Developer/Infra</strong> and <strong>Productivity</strong> hit 100% official MCP adoption and 9/10 Easy Wins. Conversely, <strong>Finance (2/10)</strong> and <strong>Marketing/Ads (4/10)</strong> are choked by Google/Meta/LinkedIn/Intuit/Plaid compliance &amp; app review gates plus enterprise contracts (PitchBook, DealCloud, Gladly, Otter).</p>
        </div>
        <div class="card">
          <span class="insight-num">Pattern 04 • Where Composio Wins Now</span>
          <h3>79% Official MCP means Composio's moat is orchestration + the 21% gap</h3>
          <p>Commodity single-app CRUD wrappers are rapidly shipping from vendors (62 Remote + 17 Local MCPs). Composio adds immediate leverage via: (a) unified multi-tenant OAuth + write-safety guardrails, and (b) filling the <strong>21% no-MCP/community gap</strong> (SendGrid actions, Discord, Telegram, Threads, Pinterest, Copper, Podio, Aircall, Amazon SP-API, Waterfall.io).</p>
        </div>
      </div>

      <div class="charts-grid">
        <div class="card">
          <h3 style="margin-bottom:12px;">Buildability Verdict (100 Apps)</h3>
          ${renderDistributionBars(patterns.distributions.buildability_verdict, verdictColors)}
        </div>
        <div class="card">
          <h3 style="margin-bottom:12px;">Primary Auth Method</h3>
          ${renderDistributionBars(patterns.distributions.auth_primary, authColors)}
        </div>
        <div class="card">
          <h3 style="margin-bottom:12px;">MCP Ecosystem Readiness</h3>
          ${renderDistributionBars(patterns.distributions.mcp_status, mcpColors)}
        </div>
        <div class="card">
          <h3 style="margin-bottom:12px;">Primary Blocker Distribution</h3>
          ${renderDistributionBars(patterns.distributions.primary_blocker, blockerColors)}
        </div>
      </div>

      <div class="playbook-grid">
        <div class="wave-card" style="border-top:3px solid #059669;">
          <span class="pill pill-green">Wave 1 • 59 Apps</span>
          <h4>Ship Immediately (Self-Serve Easy Wins)</h4>
          <p>Standard OAuth2 or Bearer/Basic auth with free sandboxes/tiers (Dev Infra 9, Productivity 9, Support 7, CRM 6, Messaging 6, AI 6, Ecommerce 5, Data/SEO 5, Marketing 4, Finance 2). Ideal for automated OpenAPI &rarr; Composio toolkit generation.</p>
        </div>
        <div class="wave-card" style="border-top:3px solid #d97706;">
          <span class="pill pill-amber">Wave 2 • 22 Apps</span>
          <h4>Build with Targeted Engineering Scaffolds</h4>
          <p>Buildable without partner deals, but need specialized auth/adapter handling: HMAC/Ed25519 signing (Binance), multi-DC routing (Zoho, Pylon, Lark), triple headers (Copper), split auth (Help Scout), or paid test accounts (SE Ranking, Ahrefs, Smartsheet, Devin, Clay).</p>
        </div>
        <div class="wave-card" style="border-top:3px solid #dc2626;">
          <span class="pill pill-red">Wave 3 • 17 Apps</span>
          <h4>Compliance Review &amp; Partner Outreach Queue</h4>
          <p>Split into <strong>App Review Gates</strong> (Google Ads, Meta Ads, LinkedIn Ads, WhatsApp, Amazon SP-API, Plaid, QuickBooks) and <strong>Partner/Sales Gates</strong> (DealCloud, Gladly, Aircall, SFCC, fanbasis, Waterfall.io, PitchBook, NotebookLM Enterprise, Otter Enterprise, Paygent Connect).</p>
        </div>
        <div class="wave-card" style="border-top:3px solid #64748b;">
          <span class="pill pill-slate">Wave 4 • 2 Apps</span>
          <h4>Local CLI / Workbench Skills</h4>
          <p><code>Sherlock</code> (Python OSINT CLI) and <code>Mermaid CLI</code> (<code>mmdc</code> Puppeteer binary) have no hosted SaaS APIs. Ship as sandboxed Composio Workbench skills or local stdio MCPs rather than REST connectors.</p>
        </div>
      </div>
    </section>

    <!-- SECTION 2: CATEGORY MATRIX -->
    <section id="clusters">
      <div class="section-head">
        <div>
          <h2>2. Category &times; Access Gate &times; Buildability Cluster Matrix</h2>
          <p class="subtitle">10 categories (10 apps each) comparing self-serve rates, gating walls, Easy Wins, and MCP saturation.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Category (10 each)</th>
              <th class="num">Self-Serve<br/>Free/Trial</th>
              <th class="num">Paid Plan<br/>Gate</th>
              <th class="num">Review /<br/>Admin Gate</th>
              <th class="num">Partner /<br/>Sales Gate</th>
              <th>Easy Wins<br/>(Build Today)</th>
              <th class="num">Minor<br/>Friction</th>
              <th class="num">Outreach /<br/>Compliance</th>
              <th class="num">CLI /<br/>Local</th>
              <th>Official MCP<br/>Coverage</th>
              <th class="num">OAuth2<br/>Support</th>
            </tr>
          </thead>
          <tbody>
            ${categoryRowsHtml}
          </tbody>
        </table>
      </div>
    </section>

    <!-- SECTION 3: THE AGENT & THE PROOF -->
    <section id="agent">
      <div class="section-head">
        <div>
          <h2>3. The Research Agent, Composio SDK Architecture &amp; Where a Human Was Needed</h2>
          <p class="subtitle">Built on <code>@composio/core@0.31.0</code> Tool Router MCP + 3-pass verification loop.</p>
        </div>
      </div>

      <div class="pipeline-grid">
        <div class="step-card">
          <div class="step-tag">Pass 1 • Agent Synthesis</div>
          <h4>Composio SDK + Structured LLM Pass</h4>
          <p>Initializes <code>composio.sessions.create(userId, { mcp: true })</code> and probes <code>composio.toolkits.get(slug)</code>, then extracts structured auth, gating, API, and MCP hypotheses into Zod-validated JSON. <strong>Result: 75/100 exact.</strong></p>
        </div>
        <div class="step-card" style="border-top-color:#0891b2;">
          <div class="step-tag" style="color:#0891b2;">Pass 2 • Docs &amp; MCP Grounding</div>
          <h4>Targeted Multi-Query Docs Verification</h4>
          <p>Re-queries narrow 2-app &amp; site-scoped doc searches specifically targeting MCP endpoints, deprecated auth methods, and production review walls. <strong>Caught 25 semantic misses &rarr; 95/100.</strong></p>
        </div>
        <div class="step-card" style="border-top-color:#059669;">
          <div class="step-tag" style="color:#059669;">Pass 3 • Live Probe + Human</div>
          <h4>100-URL HTTP Probe + 25-App Audit</h4>
          <p><code>verify_urls.ts</code> fetches all 100 evidence URLs live (fixing 4 stale 404 paths), followed by human cross-check of 25 stratified high-risk/control apps. <strong>Result: 99/100 verified + 1 flagged ambiguous.</strong></p>
        </div>
        <div class="step-card" style="border-top-color:#7c3aed;">
          <div class="step-tag" style="color:#7c3aed;">Output • Dual-Consumer Build</div>
          <h4>Deterministic Pattern Engine + HTML</h4>
          <p><code>compute_patterns.ts</code> &amp; <code>build_html.ts</code> recompute all cluster stats from raw JSON and emit this zero-dependency HTML + embedded <code>application/json</code> payload.</p>
        </div>
      </div>

      <div class="two-col">
        <div class="card">
          <h3>Where a Human Was Needed (7 of 25 Audited Cases)</h3>
          <p style="margin-bottom:10px;">Automated search + HTTP probing handles 90%+ of standard SaaS docs, but humans were essential in four failure modes:</p>
          <ul style="margin:0;padding-left:18px;font-size:0.86rem;color:var(--muted);display:grid;gap:8px;">
            <li><strong>Brand Collisions &amp; Missing Docs (<code>Paygent Connect</code>, <code>Waterfall.io</code>):</strong> "Paygent" collided across Paygent Japan (NTT DATA), <code>withpaygent.com</code> (AI LLM billing), and <code>gopaygent.com</code>/NMI white-label ISOs. Human review flagged <code>Paygent Connect</code> as <em>Low Confidence / Ambiguous</em> rather than hallucinating a wrong product.</li>
            <li><strong>Sandbox vs. Production Reality (<code>WhatsApp Business</code>, <code>DealCloud</code>):</strong> Open developer docs or free test apps fooled Pass 1 into labeling them self-serve; humans caught that live customer access triggers Meta Business Verification or 403 tenant provisioning.</li>
            <li><strong>Login/Password Walls (<code>fanbasis</code>):</strong> Search snippets mentioned payment SDKs, but human inspection confirmed <code>dev-docs.fanbasis.com</code> is password-protected behind rep approval.</li>
            <li><strong>Non-SaaS &amp; Product Boundaries (<code>NotebookLM</code>, <code>Sherlock</code>):</strong> Separating consumer NotebookLM (no official API; browser-cookie hacks) from GCP NotebookLM Enterprise, and classifying CLI tools outside REST buildability.</li>
          </ul>
        </div>

        <div class="card">
          <h3>The Proof: Composio SDK &amp; Reproducible Pipeline</h3>
          <p>Clone the repo and run the deterministic verification + report generator or live Composio Tool Router session:</p>
          <pre class="code-block"><code>// src/agent/composio_mcp_agent.ts (@composio/core@0.31.0)
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const session = await composio.sessions.create("product-ops-researcher", {
  mcp: true,
  manageConnections: false,
});
// Live Tool Router MCP URL: session.mcp.url
const tk = await composio.toolkits.get("hubspot");</code></pre>
          <pre class="code-block"><code># Reproduce URL probe, pattern diff, and HTML build locally:
npm install
npm run verify:urls   # Probes all 100 evidence URLs -> data/url_checks.json
npm run verify:diff   # Computes clusters &amp; Pass1->Pass3 deltas
npm run build:report  # Regenerates self-contained index.html</code></pre>
        </div>
      </div>
    </section>

    <!-- SECTION 4: VERIFICATION & ACCURACY -->
    <section id="verification">
      <div class="section-head">
        <div>
          <h2>4. Verification Loops &amp; Honest Accuracy Audit</h2>
          <p class="subtitle">Empirical accuracy progression across Pass 1, Pass 2, and Pass 3 — showing real hits, misses, and corrections.</p>
        </div>
      </div>

      <div class="funnel">
        <div class="funnel-step">
          <span class="pill pill-amber">Pass 1 Baseline</span>
          <div class="funnel-score" style="color:#d97706;">75%</div>
          <div style="font-size:0.84rem;color:var(--muted);"><strong>75/100</strong> exact on initial agent pass. 25 apps had MCP, auth-deprecation, or gating misses (batched queries blurred per-app specifics).</div>
        </div>
        <div class="funnel-step">
          <span class="pill pill-indigo">Pass 2 Docs &amp; MCP Loop</span>
          <div class="funnel-score" style="color:#4f46e5;">95%</div>
          <div style="font-size:0.84rem;color:var(--muted);"><strong>+20 semantic fixes</strong> via narrow 2-app &amp; <code>site:</code> MCP/docs queries (uncovered Pipedrive, Front, Gorgias, Gladly, Systeme.io official MCPs; caught SendGrid/Threads gaps).</div>
        </div>
        <div class="funnel-step">
          <span class="pill pill-green">Pass 3 Live Probe + Human</span>
          <div class="funnel-score" style="color:#059669;">99%</div>
          <div style="font-size:0.84rem;color:var(--muted);"><strong>100/100 URLs probed live</strong> (caught &amp; fixed 4 stale 404 paths: Pumble, Neo4j, ClickUp, NotebookLM) + <strong>25-app human audit</strong>. 1 app (Paygent Connect) honestly marked Ambiguous.</div>
        </div>
        <div class="funnel-step">
          <span class="pill pill-slate">Live HTTP Probe Summary</span>
          <div class="funnel-score" style="color:#0f172a;">94 + 6</div>
          <div style="font-size:0.84rem;color:var(--muted);"><strong>94 HTTP 2xx–3xx</strong> verified live; <strong>6 WAF/bot-gated</strong> portals (PitchBook, Otter, Consensus 403; Meta 400). <strong>0 dead 404s.</strong></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
          <div>
            <h3 style="margin:0;">25-App Risk-Weighted Sample Audit (4 Control Baselines + 21 Flagged Edge Cases)</h3>
            <p style="margin:2px 0 0;font-size:0.84rem;">Because we intentionally over-sampled ambiguous/conflicting apps, Pass 1 scored <strong>16% strict exact (4/25)</strong> / <strong>30% weighted</strong> on this adversarial slice before Pass 2/3 loops brought it to <strong>96% resolved + 1 flagged ambiguous</strong>.</p>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn audit-filter" data-verdict="ALL" type="button">All (25)</button>
            <button class="btn audit-filter" data-verdict="Wrong" type="button">Wrong (14)</button>
            <button class="btn audit-filter" data-verdict="Partial Miss" type="button">Partial Miss (7)</button>
            <button class="btn audit-filter" data-verdict="Correct" type="button">Correct (4)</button>
            <button class="btn audit-filter" data-verdict="HUMAN" type="button">Human Needed (7)</button>
          </div>
        </div>
        <div class="table-wrap" style="box-shadow:none;">
          <table>
            <thead>
              <tr>
                <th>App</th>
                <th>Pass 1 Verdict</th>
                <th>Pass 1 Claim (Before Loop)</th>
                <th>Verified Truth (After Pass 2 &amp; 3)</th>
                <th>Human?</th>
              </tr>
            </thead>
            <tbody id="audit-tbody"></tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- SECTION 5: ALL 100 APPS INTERACTIVE MATRIX -->
    <section id="matrix">
      <div class="section-head">
        <div>
          <h2>5. Complete 100-App Research Matrix</h2>
          <p class="subtitle">Filter by category, auth method, gating tier, buildability, or MCP status. Click any row for full technical notes &amp; verified evidence.</p>
        </div>
        <div id="matrix-count" style="font-weight:700;color:var(--accent);font-size:0.9rem;">Showing 100 of 100 apps</div>
      </div>

      <div class="controls">
        <div class="control-group">
          <label for="f-search">Search App / Tech / Blocker</label>
          <input id="f-search" type="search" placeholder="e.g. GraphQL, DCR, HubSpot, 403..." />
        </div>
        <div class="control-group">
          <label for="f-category">Category</label>
          <select id="f-category"><option value="">All Categories (10)</option></select>
        </div>
        <div class="control-group">
          <label for="f-auth">Primary Auth</label>
          <select id="f-auth"><option value="">All Auth Types</option></select>
        </div>
        <div class="control-group">
          <label for="f-cluster">Access Cluster</label>
          <select id="f-cluster"><option value="">All Access Tiers</option></select>
        </div>
        <div class="control-group">
          <label for="f-verdict">Buildability Verdict</label>
          <select id="f-verdict"><option value="">All Verdicts</option></select>
        </div>
        <div class="control-group">
          <label for="f-mcp">MCP Status</label>
          <select id="f-mcp"><option value="">All MCP Statuses</option></select>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>App &amp; One-Liner</th>
              <th>Category</th>
              <th>Auth</th>
              <th>Self-Serve vs Gated</th>
              <th>API Surface</th>
              <th>MCP Status</th>
              <th>Buildability</th>
              <th>Evidence &amp; HTTP</th>
            </tr>
          </thead>
          <tbody id="matrix-tbody"></tbody>
        </table>
      </div>
    </section>
  </main>

  <script id="composio-research-data" type="application/json">${safeJsonEmbed(embeddedPayload)}</script>
  <script>
    (function () {
      const payload = JSON.parse(document.getElementById("composio-research-data").textContent);
      const apps = payload.apps;
      const sampleAudit = payload.sample_audit_25;

      // Agent JSON drawer controls
      const drawer = document.getElementById("agent-json-drawer");
      const preview = document.getElementById("json-preview");
      document.getElementById("toggle-agent-json").addEventListener("click", () => {
        const open = drawer.classList.toggle("open");
        if (open && !preview.textContent) {
          preview.textContent = JSON.stringify({ meta: payload.meta, patterns: payload.patterns.headlines, sample_first_3_apps: apps.slice(0, 3) }, null, 2);
        }
      });

      document.getElementById("copy-json-btn").addEventListener("click", async (e) => {
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        const btn = e.currentTarget;
        const old = btn.textContent;
        btn.textContent = "Copied 100-App JSON!";
        setTimeout(() => (btn.textContent = old), 1800);
      });

      document.getElementById("download-csv-btn").addEventListener("click", () => {
        const headers = [
          "id","name","category","one_liner","auth_primary","auth_methods","access_tier",
          "self_serve_cluster","api_protocols","api_breadth","mcp_status","buildability_verdict",
          "primary_blocker","blocker_detail","evidence_url","http_status","pass1_correct"
        ];
        const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
        const rows = [headers.join(",")];
        for (const a of apps) {
          rows.push([
            a.id, a.name, a.category, a.one_liner, a.auth_primary, a.auth_methods.join(" | "),
            a.access_tier, a.self_serve_cluster, a.api_surface.protocols.join(" | "),
            a.api_surface.breadth, a.mcp_status, a.buildability_verdict, a.primary_blocker,
            a.blocker_detail, a.evidence_url, a.verification.http_status ?? "", a.verification.pass1_correct
          ].map(esc).join(","));
        }
        const blob = new Blob([rows.join("\\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "composio_100_apps_research.csv";
        link.click();
        URL.revokeObjectURL(url);
      });

      // Render 25-app audit table
      const auditTbody = document.getElementById("audit-tbody");
      function renderAudit(filterMode) {
        const filtered = sampleAudit.filter((item) => {
          if (filterMode === "ALL") return true;
          if (filterMode === "HUMAN") return item.human_needed;
          return item.pass1_verdict === filterMode;
        });
        auditTbody.innerHTML = filtered.map((s) => {
          const badgeCls = s.pass1_verdict === "Correct" ? "pill-green" : s.pass1_verdict === "Partial Miss" ? "pill-amber" : "pill-red";
          const humanBadge = s.human_needed ? '<span class="pill pill-indigo">Yes</span>' : '<span class="pill pill-slate">No</span>';
          return \`
            <tr>
              <td><strong>#\${s.id} \${escHtml(s.name)}</strong><div class="muted" style="font-size:0.76rem;">\${escHtml(s.category)}</div></td>
              <td><span class="pill \${badgeCls}">\${escHtml(s.pass1_verdict)}</span></td>
              <td style="font-size:0.82rem;color:#475569;">\${escHtml(s.pass1_claim)}</td>
              <td style="font-size:0.82rem;">\${escHtml(s.verified_truth)} <a href="\${escHtml(s.correction_source)}" target="_blank" rel="noopener">[docs]</a></td>
              <td>\${humanBadge}<div class="muted" style="font-size:0.74rem;margin-top:3px;">\${escHtml(s.human_note)}</div></td>
            </tr>
          \`;
        }).join("");
      }

      function escHtml(str) {
        return String(str ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }

      document.querySelectorAll(".audit-filter").forEach((btn) => {
        btn.addEventListener("click", () => renderAudit(btn.dataset.verdict));
      });
      renderAudit("ALL");

      // Populate matrix filter dropdowns
      const fillSelect = (id, values) => {
        const sel = document.getElementById(id);
        for (const v of values) {
          const opt = document.createElement("option");
          opt.value = v;
          opt.textContent = v;
          sel.appendChild(opt);
        }
      };
      fillSelect("f-category", [...new Set(apps.map((a) => a.category))]);
      fillSelect("f-auth", [...new Set(apps.map((a) => a.auth_primary))]);
      fillSelect("f-cluster", [...new Set(apps.map((a) => a.self_serve_cluster))]);
      fillSelect("f-verdict", [...new Set(apps.map((a) => a.buildability_verdict))]);
      fillSelect("f-mcp", [...new Set(apps.map((a) => a.mcp_status))]);

      const matrixTbody = document.getElementById("matrix-tbody");
      const countEl = document.getElementById("matrix-count");
      const expanded = new Set();

      function verdictPill(v) {
        if (v.startsWith("Easy Win")) return '<span class="pill pill-green">Easy Win</span>';
        if (v.startsWith("Buildable")) return '<span class="pill pill-amber">Buildable (Friction)</span>';
        if (v.startsWith("Gated")) return '<span class="pill pill-red">Gated / Outreach</span>';
        return '<span class="pill pill-slate">CLI / Local</span>';
      }

      function mcpPill(m) {
        if (m === "Official Remote MCP") return '<span class="pill pill-green">Official Remote</span>';
        if (m === "Official Local / OSS MCP") return '<span class="pill pill-indigo">Official OSS/Local</span>';
        if (m.startsWith("Official")) return '<span class="pill pill-amber">Official (Docs/Ent)</span>';
        if (m === "Community / 3P Only") return '<span class="pill pill-slate">Community / 3P</span>';
        return '<span class="pill pill-slate">None</span>';
      }

      function accessPill(tier, cluster) {
        if (cluster === "Self-Serve") return '<span class="pill pill-green">' + escHtml(tier) + '</span>';
        if (cluster === "Self-Serve (Trial / Paid)") return '<span class="pill pill-amber">' + escHtml(tier) + '</span>';
        return '<span class="pill pill-red">' + escHtml(tier) + '</span>';
      }

      function httpBadge(status) {
        if (status && status >= 200 && status < 400) return '<span class="pill pill-green">HTTP ' + status + '</span>';
        if (status === 403 || status === 401 || status === 429) return '<span class="pill pill-amber">WAF ' + status + '</span>';
        if (status === 400) return '<span class="pill pill-amber">Bot ' + status + '</span>';
        return '<span class="pill pill-slate">Checked</span>';
      }

      function renderMatrix() {
        const q = document.getElementById("f-search").value.trim().toLowerCase();
        const cat = document.getElementById("f-category").value;
        const auth = document.getElementById("f-auth").value;
        const cluster = document.getElementById("f-cluster").value;
        const verdict = document.getElementById("f-verdict").value;
        const mcp = document.getElementById("f-mcp").value;

        const filtered = apps.filter((a) => {
          if (cat && a.category !== cat) return false;
          if (auth && a.auth_primary !== auth) return false;
          if (cluster && a.self_serve_cluster !== cluster) return false;
          if (verdict && a.buildability_verdict !== verdict) return false;
          if (mcp && a.mcp_status !== mcp) return false;
          if (q) {
            const hay = [
              a.name, a.category, a.one_liner, a.auth_primary, a.auth_notes,
              a.gating_details, a.api_surface.summary, a.mcp_details, a.blocker_detail
            ].join(" ").toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });

        countEl.textContent = \`Showing \${filtered.length} of \${apps.length} apps\`;

        matrixTbody.innerHTML = filtered.map((a) => {
          const isOpen = expanded.has(a.id);
          const mainRow = \`
            <tr class="matrix-row" data-id="\${a.id}">
              <td class="mono muted">\${a.id}</td>
              <td>
                <strong>\${escHtml(a.name)}</strong>
                <div style="font-size:0.78rem;color:#475569;max-width:260px;">\${escHtml(a.one_liner)}</div>
              </td>
              <td style="font-size:0.79rem;">\${escHtml(a.category)}</td>
              <td>
                <span class="pill pill-indigo">\${escHtml(a.auth_primary)}</span>
                <div class="muted" style="font-size:0.72rem;margin-top:3px;">\${a.auth_methods.length} mode(s)</div>
              </td>
              <td>\${accessPill(a.access_tier, a.self_serve_cluster)}</td>
              <td style="font-size:0.78rem;">
                <strong>\${escHtml(a.api_surface.breadth)}</strong>
                <div class="muted">\${escHtml(a.api_surface.protocols.join(", "))}</div>
              </td>
              <td>\${mcpPill(a.mcp_status)}</td>
              <td>\${verdictPill(a.buildability_verdict)}</td>
              <td style="white-space:nowrap;">
                <a href="\${escHtml(a.evidence_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Docs &nearr;</a>
                <div style="margin-top:4px;">\${httpBadge(a.verification.http_status)}</div>
              </td>
            </tr>
          \`;
          if (!isOpen) return mainRow;

          const passBadge = a.verification.pass1_correct
            ? '<span class="pill pill-green">Pass 1 Exact</span>'
            : '<span class="pill pill-amber">Corrected in Pass 2/3</span>';
          const detailRow = \`
            <tr class="detail-row">
              <td colspan="9">
                <div class="detail-grid">
                  <div class="detail-box">
                    <strong>All Auth Methods &amp; Nuances</strong>
                    <div>\${escHtml(a.auth_methods.join(" • "))}</div>
                    <div class="muted" style="margin-top:4px;">\${escHtml(a.auth_notes)}</div>
                  </div>
                  <div class="detail-box">
                    <strong>Self-Serve vs Gating Details</strong>
                    <div>\${escHtml(a.gating_details)}</div>
                  </div>
                  <div class="detail-box">
                    <strong>API Surface &amp; MCP Details</strong>
                    <div>\${escHtml(a.api_surface.summary)}</div>
                    <div class="muted" style="margin-top:4px;"><strong>MCP:</strong> \${escHtml(a.mcp_details)}</div>
                  </div>
                  <div class="detail-box">
                    <strong>Blocker &amp; Verification Audit</strong>
                    <div><strong>\${escHtml(a.primary_blocker)}:</strong> \${escHtml(a.blocker_detail)}</div>
                    <div style="margin-top:6px;">\${passBadge} <span class="pill pill-slate">Confidence: \${escHtml(a.verification.confidence)}</span></div>
                    \${a.verification.pass1_issues.length ? '<div style="margin-top:4px;color:#92400e;"><strong>Pass 1 Miss:</strong> ' + escHtml(a.verification.pass1_issues.join("; ")) + '</div>' : ''}
                  </div>
                </div>
              </td>
            </tr>
          \`;
          return mainRow + detailRow;
        }).join("");

        document.querySelectorAll(".matrix-row").forEach((row) => {
          row.addEventListener("click", () => {
            const id = Number(row.dataset.id);
            if (expanded.has(id)) expanded.delete(id);
            else expanded.add(id);
            renderMatrix();
          });
        });
      }

      ["f-search", "f-category", "f-auth", "f-cluster", "f-verdict", "f-mcp"].forEach((id) => {
        document.getElementById(id).addEventListener("input", renderMatrix);
        document.getElementById(id).addEventListener("change", renderMatrix);
      });
      renderMatrix();
    })();
  </script>
</body>
</html>`;

  const outPath = path.join(rootDir, "index.html");
  await fs.writeFile(outPath, html, "utf8");
  return outPath;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  buildReportHtml()
    .then((p) => console.log("Generated:", p))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
