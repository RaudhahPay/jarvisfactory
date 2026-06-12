// ============================================================
// ezclaude — Cloudflare Worker front door + Container definition
// ============================================================
// The Worker is a thin router: every request is forwarded to a single shared
// Container instance running the Next.js standalone server (the Agent SDK needs
// Node, so the whole app runs in the container — see CLAUDE.md §3/§5).
//
// Runtime secrets reach the container via `envVars`, sourced from Worker vars +
// secrets (wrangler secret put …). Build-time NEXT_PUBLIC_* are baked at image
// build via image_vars; we also pass them at runtime so server-side reads work.
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
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID: string;
  NEXT_PUBLIC_V2_ENGINE?: string;
}

export class EzClaudeContainer extends Container<Env> {
  defaultPort = 3000;
  // Agent turns are long; keep the box warm a while after the last request.
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
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID:
        env.NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID,
      NEXT_PUBLIC_V2_ENGINE: env.NEXT_PUBLIC_V2_ENGINE || "1",
    };
    // envVars must be Record<string,string> — drop anything unset.
    this.envVars = Object.fromEntries(
      Object.entries(vars).filter(([, v]) => v != null),
    ) as Record<string, string>;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Single shared instance — this is the founder's app, not per-user sandboxes
    // (those live in the separate sandbox-worker). Scale to per-tenant later.
    return getContainer(env.APP, "ezclaude-main").fetch(request);
  },
};
