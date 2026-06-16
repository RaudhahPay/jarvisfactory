# ============================================================
# ezclaude — Cloudflare Container image (Vite SPA + Hono API + Claude Agent SDK)
# ============================================================
# Must run on linux/amd64 (Cloudflare Containers requirement). Build stages use
# oven/bun (Debian/glibc) so deps resolve via bun.lock; the runner uses node:22-slim
# (also Debian/glibc) to run the bundled Hono server. The glibc base matches the
# @anthropic-ai/claude-agent-sdk-linux-x64 binary the SDK spawns as a subprocess.
#
# VITE_* are inlined at `vite build` → passed as build args (image_vars in
# wrangler.jsonc). Runtime secrets (ANTHROPIC_API_KEY, bridge token, GH secret) are
# injected by the Container class at start, NOT baked here.
# ============================================================

# ---- deps: install once with bun (pulls the linux-x64 agent binary) ----
FROM oven/bun:1-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---- builder: compile Vite SPA + Hono server bundle ----
FROM oven/bun:1-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_GITHUB_OAUTH_CLIENT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_GITHUB_OAUTH_CLIENT_ID=$VITE_GITHUB_OAUTH_CLIENT_ID

RUN bun run build

# ---- runner: minimal node runtime ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# git + CA certs: the Claude CLI shells out to git and needs TLS roots for HTTPS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Hono server bundle + SPA static assets.
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/web/dist ./web/dist

# Runtime node_modules (hono, supabase-js, agent SDK + platform binary, etc.).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "server/dist/index.js"]
