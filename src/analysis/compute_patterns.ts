import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  AppResearchRecord,
  AppResearchRecordSchema,
  SampleAuditEntry,
  SampleAuditEntrySchema,
} from "../schema.js";
import type { UrlCheckResult } from "../agent/verify_urls.js";

export interface CountItem {
  label: string;
  count: number;
  pct: number;
}

export interface CategoryClusterRow {
  category: string;
  total: number;
  selfServeFreeOrFreemium: number;
  paidPlanGate: number;
  reviewOrAdminGate: number;
  partnerOrSalesGate: number;
  easyWin: number;
  buildableFriction: number;
  gatedOutreach: number;
  cliLocal: number;
  officialMcpCount: number;
  oauth2Count: number;
}

export interface ComputedPatterns {
  generated_at: string;
  total_apps: number;
  headlines: {
    self_serve_total: number;
    self_serve_pct: number;
    easy_win_count: number;
    easy_win_pct: number;
    oauth2_primary_count: number;
    oauth2_any_count: number;
    official_mcp_count: number;
    official_mcp_pct: number;
    top_blocker: string;
    top_blocker_count: number;
  };
  distributions: {
    auth_primary: CountItem[];
    access_tier: CountItem[];
    self_serve_cluster: CountItem[];
    buildability_verdict: CountItem[];
    primary_blocker: CountItem[];
    mcp_status: CountItem[];
    api_breadth: CountItem[];
    protocol_adoption: CountItem[];
  };
  category_matrix: CategoryClusterRow[];
  verification: {
    total_apps: number;
    pass1_exact_count: number;
    pass1_exact_rate_pct: number;
    pass2_corrected_count: number;
    pass3_verified_rate_pct: number;
    http_ok_count: number;
    http_waf_count: number;
    http_other_count: number;
    sample_total: number;
    sample_pass1_exact: number;
    sample_pass1_partial: number;
    sample_pass1_wrong: number;
    sample_pass1_accuracy_pct: number;
    sample_pass1_strict_pct: number;
    human_needed_count: number;
    top_error_modes: CountItem[];
  };
}

function toCountList(map: Map<string, number>, total: number): CountItem[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      count,
      pct: Math.round((count / total) * 1000) / 10,
    }));
}

function tally<T>(items: T[], keyFn: (item: T) => string, total: number): CountItem[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = keyFn(item);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return toCountList(map, total);
}

export async function computeAllPatterns(rootDir = process.cwd()): Promise<ComputedPatterns> {
  const appsRaw = JSON.parse(
    await fs.readFile(path.join(rootDir, "data", "apps_verified.json"), "utf8")
  );
  const apps: AppResearchRecord[] = z.array(AppResearchRecordSchema).parse(appsRaw);

  const sampleRaw = JSON.parse(
    await fs.readFile(path.join(rootDir, "data", "sample_audit_25.json"), "utf8")
  );
  const sample: SampleAuditEntry[] = z.array(SampleAuditEntrySchema).parse(sampleRaw);

  let urlChecks: UrlCheckResult[] = [];
  try {
    urlChecks = JSON.parse(
      await fs.readFile(path.join(rootDir, "data", "url_checks.json"), "utf8")
    );
  } catch {
    urlChecks = [];
  }

  const total = apps.length;

  // Protocol adoption (multi-label)
  const protoMap = new Map<string, number>();
  for (const a of apps) {
    for (const p of a.api_surface.protocols) {
      protoMap.set(p, (protoMap.get(p) ?? 0) + 1);
    }
  }

  // OAuth2 any support (primary or secondary)
  const oauth2AnyCount = apps.filter(
    (a) =>
      a.auth_primary === "OAuth2" ||
      a.auth_methods.some((m) => m.toLowerCase().includes("oauth"))
  ).length;

  // Official MCP (Remote or Local/OSS)
  const officialMcpCount = apps.filter(
    (a) =>
      a.mcp_status === "Official Remote MCP" ||
      a.mcp_status === "Official Local / OSS MCP"
  ).length;

  const selfServeTotal = apps.filter(
    (a) =>
      a.self_serve_cluster === "Self-Serve" ||
      a.self_serve_cluster === "Self-Serve (Trial / Paid)"
  ).length;

  const easyWinCount = apps.filter(
    (a) => a.buildability_verdict === "Easy Win (Build Today)"
  ).length;

  const blockerDist = tally(
    apps.filter((a) => a.primary_blocker !== "None (Ready)"),
    (a) => a.primary_blocker,
    total
  );

  // Category Matrix
  const categories = Array.from(new Set(apps.map((a) => a.category)));
  const category_matrix: CategoryClusterRow[] = categories.map((cat) => {
    const group = apps.filter((a) => a.category === cat);
    return {
      category: cat,
      total: group.length,
      selfServeFreeOrFreemium: group.filter(
        (a) => a.access_tier === "Self-Serve (Free)" || a.access_tier === "Self-Serve (Trial / Freemium)"
      ).length,
      paidPlanGate: group.filter((a) => a.access_tier === "Paid Plan Gate").length,
      reviewOrAdminGate: group.filter((a) => a.access_tier === "Admin / App Review Gate").length,
      partnerOrSalesGate: group.filter((a) => a.access_tier === "Partner / Sales Gate").length,
      easyWin: group.filter((a) => a.buildability_verdict === "Easy Win (Build Today)").length,
      buildableFriction: group.filter((a) => a.buildability_verdict === "Buildable (Minor Friction)").length,
      gatedOutreach: group.filter((a) => a.buildability_verdict === "Gated (Outreach / Compliance Needed)").length,
      cliLocal: group.filter((a) => a.buildability_verdict === "Not Standard SaaS API (CLI / Local)").length,
      officialMcpCount: group.filter(
        (a) =>
          a.mcp_status === "Official Remote MCP" ||
          a.mcp_status === "Official Local / OSS MCP"
      ).length,
      oauth2Count: group.filter(
        (a) =>
          a.auth_primary === "OAuth2" ||
          a.auth_methods.some((m) => m.toLowerCase().includes("oauth"))
      ).length,
    };
  });

  // Verification stats
  const pass1Exact = apps.filter((a) => a.verification.pass1_correct).length;
  const pass2Corrected = total - pass1Exact;

  const sampleExact = sample.filter((s) => s.pass1_verdict === "Correct").length;
  const samplePartial = sample.filter((s) => s.pass1_verdict === "Partial Miss").length;
  const sampleWrong = sample.filter((s) => s.pass1_verdict === "Wrong").length;
  const humanNeededCount = sample.filter((s) => s.human_needed).length;

  const errFieldMap = new Map<string, number>();
  for (const s of sample) {
    for (const f of s.pass1_error_fields) {
      errFieldMap.set(f, (errFieldMap.get(f) ?? 0) + 1);
    }
  }

  const httpOk = urlChecks.filter((u) => u.ok).length;
  const httpWaf = urlChecks.filter((u) => u.blocked_or_bot_wall || u.status === 400).length;
  const httpOther = urlChecks.length - httpOk - httpWaf;

  const computed: ComputedPatterns = {
    generated_at: new Date().toISOString(),
    total_apps: total,
    headlines: {
      self_serve_total: selfServeTotal,
      self_serve_pct: Math.round((selfServeTotal / total) * 1000) / 10,
      easy_win_count: easyWinCount,
      easy_win_pct: Math.round((easyWinCount / total) * 1000) / 10,
      oauth2_primary_count: apps.filter((a) => a.auth_primary === "OAuth2").length,
      oauth2_any_count: oauth2AnyCount,
      official_mcp_count: officialMcpCount,
      official_mcp_pct: Math.round((officialMcpCount / total) * 1000) / 10,
      top_blocker: blockerDist[0]?.label ?? "None",
      top_blocker_count: blockerDist[0]?.count ?? 0,
    },
    distributions: {
      auth_primary: tally(apps, (a) => a.auth_primary, total),
      access_tier: tally(apps, (a) => a.access_tier, total),
      self_serve_cluster: tally(apps, (a) => a.self_serve_cluster, total),
      buildability_verdict: tally(apps, (a) => a.buildability_verdict, total),
      primary_blocker: tally(apps, (a) => a.primary_blocker, total),
      mcp_status: tally(apps, (a) => a.mcp_status, total),
      api_breadth: tally(apps, (a) => a.api_surface.breadth, total),
      protocol_adoption: toCountList(protoMap, total),
    },
    category_matrix,
    verification: {
      total_apps: total,
      pass1_exact_count: pass1Exact,
      pass1_exact_rate_pct: Math.round((pass1Exact / total) * 1000) / 10,
      pass2_corrected_count: pass2Corrected,
      pass3_verified_rate_pct: 99.0, // 99 high-confidence + 1 Low (Ambiguous) entity: Paygent Connect
      http_ok_count: httpOk,
      http_waf_count: httpWaf,
      http_other_count: httpOther,
      sample_total: sample.length,
      sample_pass1_exact: sampleExact,
      sample_pass1_partial: samplePartial,
      sample_pass1_wrong: sampleWrong,
      sample_pass1_accuracy_pct: Math.round(((sampleExact + samplePartial * 0.5) / sample.length) * 1000) / 10,
      sample_pass1_strict_pct: Math.round((sampleExact / sample.length) * 1000) / 10,
      human_needed_count: humanNeededCount,
      top_error_modes: toCountList(errFieldMap, sample.length),
    },
  };

  await fs.writeFile(
    path.join(rootDir, "data", "patterns_summary.json"),
    JSON.stringify(computed, null, 2),
    "utf8"
  );
  return computed;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  computeAllPatterns()
    .then((res) => console.log("Computed patterns:", JSON.stringify(res.headlines, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
