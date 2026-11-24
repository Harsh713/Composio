import fs from "node:fs/promises";
import path from "node:path";
import { AppResearchRecord, AppResearchRecordSchema } from "../schema.js";
import { z } from "zod";

export interface UrlCheckResult {
  id: number;
  name: string;
  url: string;
  final_url: string;
  status: number | null;
  ok: boolean;
  blocked_or_bot_wall: boolean;
  title: string | null;
  latency_ms: number;
  error: string | null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  if (!match) return null;
  return match[1].replace(/\s+/g, " ").trim();
}

async function probeUrl(app: AppResearchRecord): Promise<UrlCheckResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(app.evidence_url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const text = await res.text();
    const title = extractTitle(text.slice(0, 32000));
    const latency = Date.now() - start;
    // Some developer portals (Cloudflare WAF / login walls) return 403 or 401 to non-browser fetch even though docs exist
    const blockedOrBotWall = res.status === 403 || res.status === 401 || res.status === 429;
    return {
      id: app.id,
      name: app.name,
      url: app.evidence_url,
      final_url: res.url,
      status: res.status,
      ok: res.status >= 200 && res.status < 400,
      blocked_or_bot_wall: blockedOrBotWall,
      title,
      latency_ms: latency,
      error: null,
    };
  } catch (err) {
    return {
      id: app.id,
      name: app.name,
      url: app.evidence_url,
      final_url: app.evidence_url,
      status: null,
      ok: false,
      blocked_or_bot_wall: false,
      title: null,
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyAllEvidenceUrls(rootDir = process.cwd()): Promise<UrlCheckResult[]> {
  const verifiedPath = path.join(rootDir, "data", "apps_verified.json");
  const raw = JSON.parse(await fs.readFile(verifiedPath, "utf8"));
  const apps = z.array(AppResearchRecordSchema).parse(raw);

  const results: UrlCheckResult[] = new Array(apps.length);
  const concurrency = 10;
  let cursor = 0;

  async function worker() {
    while (cursor < apps.length) {
      const idx = cursor++;
      const app = apps[idx];
      const check = await probeUrl(app);
      results[idx] = check;
      app.verification.http_status = check.status;
      if (check.status !== null && !app.verification.verified_via.includes("HTTP URL Probe")) {
        app.verification.verified_via.push("HTTP URL Probe");
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  await fs.writeFile(
    path.join(rootDir, "data", "url_checks.json"),
    JSON.stringify(results, null, 2),
    "utf8"
  );
  await fs.writeFile(verifiedPath, JSON.stringify(apps, null, 2), "utf8");

  const okCount = results.filter((r) => r.ok).length;
  const wafCount = results.filter((r) => r.blocked_or_bot_wall).length;
  const failCount = results.filter((r) => !r.ok && !r.blocked_or_bot_wall).length;
  console.log(
    `URL probe complete: ${okCount}/100 HTTP 2xx-3xx, ${wafCount} WAF/auth-wall (401/403/429), ${failCount} network/other failures.`
  );
  return results;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  verifyAllEvidenceUrls().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
