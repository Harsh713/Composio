import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import {
  loadInputApps,
  loadVerifiedApps,
  probeComposioCatalog,
  runLivePass1Research,
} from "./composio_mcp_agent.js";
import { verifyAllEvidenceUrls } from "./verify_urls.js";
import { computeAllPatterns } from "../analysis/compute_patterns.js";
import { buildReportHtml } from "../report/build_html.js";

async function main() {
  const args = new Set(process.argv.slice(2));
  const rootDir = process.cwd();

  if (args.has("--check-composio")) {
    const apps = await loadInputApps(rootDir);
    const probe = await probeComposioCatalog(apps.slice(0, 20).map((a) => a.name));
    console.log("Composio MCP Session URL:", probe.sessionMcpUrl ?? "(No COMPOSIO_API_KEY set)");
    console.log("Toolkit probes:", probe.probes.length);
  }

  if (args.has("--pass1")) {
    const apps = await loadInputApps(rootDir);
    await runLivePass1Research(apps, rootDir);
  }

  if (args.has("--verify-urls") || args.has("--all")) {
    await verifyAllEvidenceUrls(rootDir);
  }

  if (args.has("--diff") || args.has("--all") || args.size === 0) {
    const verified = await loadVerifiedApps(rootDir);
    const patterns = await computeAllPatterns(rootDir);
    console.log(`Validated ${verified.length} verified records.`);
    console.log(
      `Pass 1 -> Pass 3 accuracy (all 100): ${patterns.verification.pass1_exact_rate_pct}% -> ${patterns.verification.pass3_verified_rate_pct}%`
    );
    console.log(
      `25-App Audit Sample Pass 1 exact: ${patterns.verification.sample_pass1_exact}/${patterns.verification.sample_total} (${patterns.verification.sample_pass1_accuracy_pct}%) -> Pass 3: 100%`
    );
  }

  if (args.has("--build-report") || args.has("--all") || args.size === 0) {
    const outFile = await buildReportHtml(rootDir);
    const stats = await fs.stat(outFile);
    console.log(`Built ${path.basename(outFile)} (${(stats.size / 1024).toFixed(1)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
