import { z } from "zod";

export const CategoryEnum = z.enum([
  "CRM and Sales",
  "Support and Helpdesk",
  "Communications and Messaging",
  "Marketing, Ads, Email and Social",
  "Ecommerce",
  "Data, SEO and Scraping",
  "Developer, Infra and Data platforms",
  "Productivity and Project Management",
  "Finance and Fintech",
  "AI, Research and Media-native",
]);

export const AuthPrimaryEnum = z.enum([
  "OAuth2",
  "API Key",
  "Basic",
  "Bearer / PAT",
  "Custom Header / HMAC",
  "IAM / SSO",
  "None (CLI / Local)",
]);

export const AccessTierEnum = z.enum([
  "Self-Serve (Free)",
  "Self-Serve (Trial / Freemium)",
  "Paid Plan Gate",
  "Admin / App Review Gate",
  "Partner / Sales Gate",
]);

export const SelfServeClusterEnum = z.enum([
  "Self-Serve",
  "Self-Serve (Trial / Paid)",
  "Partially Gated (Review / Admin)",
  "Gated (Partner / Enterprise)",
]);

export const McpStatusEnum = z.enum([
  "Official Remote MCP",
  "Official Local / OSS MCP",
  "Official (Enterprise / Docs-Only)",
  "Community / 3P Only",
  "None",
]);

export const BuildabilityVerdictEnum = z.enum([
  "Easy Win (Build Today)",
  "Buildable (Minor Friction)",
  "Gated (Outreach / Compliance Needed)",
  "Not Standard SaaS API (CLI / Local)",
]);

export const PrimaryBlockerEnum = z.enum([
  "None (Ready)",
  "Paid Plan / Credit Gate",
  "App Review / Verification Gate",
  "Partner / Enterprise Sales Gate",
  "Non-Standard / Local Auth or CLI",
  "Ambiguous / Undocumented Entity",
]);

export const AppInputSchema = z.object({
  id: z.number().int().min(1).max(100),
  name: z.string(),
  category: CategoryEnum,
  hint: z.string(),
});

export const AppResearchRecordSchema = z.object({
  id: z.number().int().min(1).max(100),
  name: z.string(),
  category: CategoryEnum,
  hint: z.string(),
  one_liner: z.string(),
  auth_primary: AuthPrimaryEnum,
  auth_methods: z.array(z.string()).min(1),
  auth_notes: z.string(),
  access_tier: AccessTierEnum,
  self_serve_cluster: SelfServeClusterEnum,
  gating_details: z.string(),
  api_surface: z.object({
    protocols: z.array(z.enum(["REST", "GraphQL", "CLI", "RPC / SDK", "Webhooks"])).min(1),
    breadth: z.enum([
      "Comprehensive",
      "Moderate",
      "Narrow / Specialized",
      "Minimal / Unofficial",
      "None (CLI-only)",
    ]),
    summary: z.string(),
  }),
  mcp_status: McpStatusEnum,
  mcp_details: z.string(),
  buildability_verdict: BuildabilityVerdictEnum,
  primary_blocker: PrimaryBlockerEnum,
  blocker_detail: z.string(),
  evidence_url: z.string().url(),
  evidence_title: z.string(),
  verification: z.object({
    pass1_correct: z.boolean(),
    pass1_issues: z.array(z.string()),
    verified_via: z.array(z.enum(["Web Search Docs", "HTTP URL Probe", "Manual Cross-Check"])),
    http_status: z.number().nullable(),
    confidence: z.enum(["High", "Medium", "Low (Ambiguous)"]),
  }),
});

export const Pass1RecordSchema = z.object({
  id: z.number().int().min(1).max(100),
  name: z.string(),
  category: CategoryEnum,
  one_liner: z.string(),
  auth_primary: AuthPrimaryEnum,
  auth_methods: z.array(z.string()),
  access_tier: AccessTierEnum,
  self_serve_cluster: SelfServeClusterEnum,
  mcp_status: McpStatusEnum,
  buildability_verdict: BuildabilityVerdictEnum,
  primary_blocker: PrimaryBlockerEnum,
  evidence_url: z.string(),
  pass1_notes: z.string(),
});

export const SampleAuditEntrySchema = z.object({
  id: z.number().int().min(1).max(100),
  name: z.string(),
  category: CategoryEnum,
  sample_reason: z.string(),
  pass1_verdict: z.enum(["Correct", "Partial Miss", "Wrong"]),
  pass1_error_fields: z.array(z.string()),
  pass1_claim: z.string(),
  verified_truth: z.string(),
  correction_source: z.string(),
  human_needed: z.boolean(),
  human_note: z.string(),
});

export type AppInput = z.infer<typeof AppInputSchema>;
export type AppResearchRecord = z.infer<typeof AppResearchRecordSchema>;
export type Pass1Record = z.infer<typeof Pass1RecordSchema>;
export type SampleAuditEntry = z.infer<typeof SampleAuditEntrySchema>;
