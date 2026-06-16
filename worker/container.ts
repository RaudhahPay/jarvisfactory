// ============================================================
// ezclaude — Cloudflare Worker front door + Container definition
// ============================================================
// The Worker is a thin router: every request is forwarded to a single shared
// Container instance running the Hono API server (the Agent SDK needs Node,
// so the whole app runs in the container — see CLAUDE.md §3/§5).
//
// Runtime secrets reach the container via `envVars`, sourced from Worker vars +
// secrets (wrangler secret put …). Build-time VITE_* are baked at image build
// via image_vars; server-side env uses SUPABASE_* (no NEXT_PUBLIC_ prefix).
// ============================================================

import { Container, getContainer } from "@cloudflare/containers";

interface Env {
  APP: DurableObjectNamespace;
  ANTHROPIC_API_KEY: string;
  SANDBOX_PROVIDER: string;
  SANDBOX_BRIDGE_URL: string;
  SANDBOX_BRIDGE_TOKEN: string;
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  DEFAULT_MONTHLY_COST_LIMIT_USD?: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

export class EzClaudeContainer extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = "20m";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const vars: Record<string, string | undefined> = {
      NODE_ENV: "production",
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
      SANDBOX_PROVIDER: env.SANDBOX_PROVIDER || "cloudflare",
      SANDBOX_BRIDGE_URL: env.SANDBOX_BRIDGE_URL,
      SANDBOX_BRIDGE_TOKEN: env.SANDBOX_BRIDGE_TOKEN,
      GITHUB_OAUTH_CLIENT_ID: env.GITHUB_OAUTH_CLIENT_ID,
      GITHUB_OAUTH_CLIENT_SECRET: env.GITHUB_OAUTH_CLIENT_SECRET,
      DEFAULT_MONTHLY_COST_LIMIT_USD:
        env.DEFAULT_MONTHLY_COST_LIMIT_USD || "20",
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
    };
    this.envVars = Object.fromEntries(
      Object.entries(vars).filter(([, v]) => v != null),
    ) as Record<string, string>;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return getContainer(env.APP, "ezclaude-main").fetch(request);
  },
};
