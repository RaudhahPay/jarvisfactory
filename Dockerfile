# ============================================================
# ezclaude — Cloudflare Container image (Next.js + Claude Agent SDK)
# ============================================================
# Must run on linux/amd64 (Cloudflare Containers requirement). node:22-slim is
# Debian/glibc, which matches the @anthropic-ai/claude-agent-sdk-linux-x64 (glibc,
# non-musl) binary that npm installs below. The Agent SDK spawns that ~220MB `claude`
# binary as a subprocess, so it is baked into the image (no cold-start download).
#
# NEXT_PUBLIC_* are inlined at `next build` → passed as build args (image_vars in
# wrangler.jsonc). Runtime secrets (ANTHROPIC_API_KEY, bridge token, GH secret) are
# injected by the Container class at start, NOT baked here.
# ============================================================

# ---- deps: install once (pulls the linux-x64 agent binary as an optional dep) ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- builder: compile the Next.js standalone server ----
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID
ARG NEXT_PUBLIC_V2_ENGINE
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID=$NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID \
    NEXT_PUBLIC_V2_ENGINE=$NEXT_PUBLIC_V2_ENGINE \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- runner: minimal runtime ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# git + CA certs: the Claude CLI shells out to git and needs TLS roots for HTTPS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Standalone server + assets. Owned by the non-root `node` user — the Claude agent
# binary REFUSES bypassPermissions as root ("cannot be used with root/sudo privileges",
# exit 1), so the whole app must run unprivileged.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Belt-and-suspenders: ensure the Agent SDK + its platform binary are present in the
# standalone node_modules even if file tracing missed the dynamically-spawned binary.
COPY --from=deps --chown=node:node /app/node_modules/@anthropic-ai/claude-agent-sdk ./node_modules/@anthropic-ai/claude-agent-sdk
COPY --from=deps --chown=node:node /app/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64 ./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64

USER node
ENV HOME=/home/node

EXPOSE 3000
CMD ["node", "server.js"]
