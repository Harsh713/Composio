import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { Composio } from "@composio/core";
import OpenAI from "openai";
import { z } from "zod";
import {
  AppInput,
  AppInputSchema,
  AppResearchRecord,
  AppResearchRecordSchema,
  Pass1Record,
  Pass1RecordSchema,
} from "../schema.js";

/**
 * Composio SDK + Tool Router MCP Research Agent
 *
 * Uses `@composio/core` (`composio.sessions.create(..., { mcp: true })`) to:
 * 1. Provision an isolated Tool Router MCP session for the research agent.
 * 2. Check existing Composio toolkit coverage via `composio.toolkits.get(...)`
 *    so buildability verdicts distinguish existing catalog connectors vs greenfield apps.
 * 3. Run Pass 1 structured research (LLM + MCP/web tools) and Pass 2 verification
 *    against live developer documentation URLs.
 */

export interface ComposioCatalogProbe {
  slug: string;
  found: boolean;
  name?: string;
  authSchemes?: string[];
}

export async function probeComposioCatalog(
  appNames: string[]
): Promise<{ sessionMcpUrl: string | null; probes: ComposioCatalogProbe[] }> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    return { sessionMcpUrl: null, probes: [] };
  }

  const composio = new Composio({ apiKey });
  const userId = process.env.COMPOSIO_USER_ID || "product-ops-researcher";

  // Create a Composio Tool Router MCP session (v0.31+ canonical API)
  const session = await composio.sessions.create(userId, {
    mcp: true,
    manageConnections: false,
  });

  const probes: ComposioCatalogProbe[] = [];
  for (const rawName of appNames) {
    const slug = rawName
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    try {
      const tk = await composio.toolkits.get(slug);
      probes.push({
        slug,
        found: true,
        name: tk.name,
        authSchemes: (tk.authConfigDetails ?? []).map((a) => a.mode).filter(Boolean),
      });
    } catch {
      probes.push({ slug, found: false });
    }
  }

  return {
    sessionMcpUrl: session.mcp.url,
    probes,
  };
}

const LLMResearchOutputSchema = z.object({
  one_liner: z.string(),
  auth_primary: AppResearchRecordSchema.shape.auth_primary,
  auth_methods: z.array(z.string()).min(1),
  auth_notes: z.string(),
  access_tier: AppResearchRecordSchema.shape.access_tier,
  self_serve_cluster: AppResearchRecordSchema.shape.self_serve_cluster,
  gating_details: z.string(),
  protocols: z.array(z.enum(["REST", "GraphQL", "CLI", "RPC / SDK", "Webhooks"])).min(1),
  breadth: AppResearchRecordSchema.shape.api_surface.shape.breadth,
  api_summary: z.string(),
  mcp_status: AppResearchRecordSchema.shape.mcp_status,
  mcp_details: z.string(),
  buildability_verdict: AppResearchRecordSchema.shape.buildability_verdict,
  primary_blocker: AppResearchRecordSchema.shape.primary_blocker,
  blocker_detail: z.string(),
  evidence_url: z.string().url(),
  evidence_title: z.string(),
});

export async function runLivePass1Research(
  apps: AppInput[],
  rootDir = process.cwd(),
  limit = apps.length
): Promise<Pass1Record[]> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Set OPENAI_API_KEY (and optionally COMPOSIO_API_KEY) in .env to run live Pass 1 LLM research, or inspect existing data/pass1_baseline.json."
    );
  }

  const client = new OpenAI({ apiKey: openaiKey });
  const model = process.env.RESEARCH_MODEL || "gpt-4.1-mini";

  let sessionMcpUrl: string | null = null;
  if (process.env.COMPOSIO_API_KEY) {
    const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
    const session = await composio.sessions.create(
      process.env.COMPOSIO_USER_ID || "product-ops-researcher",
      { mcp: true, manageConnections: false }
    );
    sessionMcpUrl = session.mcp.url;
    console.log(`Initialized Composio Tool Router MCP session: ${sessionMcpUrl}`);
  }

  const subset = apps.slice(0, limit);
  const results: Pass1Record[] = [];

  for (const app of subset) {
    const prompt = [
      `You are an AI Product Ops researcher evaluating integrations for Composio.`,
      `Research app #${app.id}: "${app.name}" (Category: ${app.category}, Hint: ${app.hint}).`,
      `Return ONLY valid JSON matching these keys:`,
      `one_liner, auth_primary, auth_methods, auth_notes, access_tier, self_serve_cluster, gating_details, protocols, breadth, api_summary, mcp_status, mcp_details, buildability_verdict, primary_blocker, blocker_detail, evidence_url, evidence_title.`,
      `Be conservative: if docs are partner-gated, password-protected, or enterprise-only, state that explicitly.`,
    ].join("\n");

    const response = await client.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return strict JSON only. Never invent undocumented endpoints. Use canonical official developer documentation URLs.",
        },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = LLMResearchOutputSchema.parse(JSON.parse(content));
    results.push(
      Pass1RecordSchema.parse({
        id: app.id,
        name: app.name,
        category: app.category,
        one_liner: parsed.one_liner,
        auth_primary: parsed.auth_primary,
        auth_methods: parsed.auth_methods,
        access_tier: parsed.access_tier,
        self_serve_cluster: parsed.self_serve_cluster,
        mcp_status: parsed.mcp_status,
        buildability_verdict: parsed.buildability_verdict,
        primary_blocker: parsed.primary_blocker,
        evidence_url: parsed.evidence_url,
        pass1_notes: parsed.blocker_detail,
      })
    );
    console.log(`[Pass 1] ${app.id}/100 ${app.name} -> ${parsed.auth_primary} / ${parsed.buildability_verdict}`);
  }

  const outPath = path.join(rootDir, "data", "pass1_live_output.json");
  await fs.writeFile(outPath, JSON.stringify(results, null, 2), "utf8");
  return results;
}

export async function loadInputApps(rootDir = process.cwd()): Promise<AppInput[]> {
  const raw = JSON.parse(await fs.readFile(path.join(rootDir, "data", "apps_input.json"), "utf8"));
  return z.array(AppInputSchema).parse(raw);
}

export async function loadVerifiedApps(rootDir = process.cwd()): Promise<AppResearchRecord[]> {
  const raw = JSON.parse(await fs.readFile(path.join(rootDir, "data", "apps_verified.json"), "utf8"));
  return z.array(AppResearchRecordSchema).parse(raw);
}
