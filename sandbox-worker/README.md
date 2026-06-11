# JarvisFactory Sandbox Worker (bridge)

Thin Cloudflare Worker that exposes [`@cloudflare/sandbox`](https://developers.cloudflare.com/sandbox/)
over HTTP so the Node-side `CloudflareSandboxDriver` (`lib/sandbox/cloudflare-driver.ts`)
can drive sandboxes. **The Sandbox SDK only runs in the Workers runtime; the Agent SDK
only runs in Node — this bridge is what connects the two.**

```
Node (Next /api/build → AgentRunner → CloudflareSandboxDriver)
   │  HTTPS + Bearer BRIDGE_TOKEN
   ▼
Cloudflare Worker (this) ──env.Sandbox DO──▶ @cloudflare/sandbox ──▶ Container
                                                                  └─ preview URL (tunnels)
```

## Endpoints (all POST, `Authorization: Bearer <BRIDGE_TOKEN>`)
`/create` `/status` `/write` `/read` `/list` `/delete` `/exec` `/start-dev` `/stop-dev`
`/preview` `/snapshot` `/suspend` `/destroy` — body always includes `{ id, ... }`.
Project files live under `/workspace`; the driver sends relative paths.

## One-time setup (founder / human)
1. **Cloudflare account on the Workers _Paid_ plan** — Containers are not on Free.
2. Install Docker locally (needed for `wrangler dev` to build the container) and
   `npm i -g wrangler@^4.76`.
3. From this folder: `npm install`.
4. Set the shared secret (must match the Node app's `SANDBOX_BRIDGE_TOKEN`):
   ```bash
   wrangler secret put BRIDGE_TOKEN
   ```
5. Deploy: `npm run deploy` → note the `https://jarvisfactory-sandbox.<acct>.workers.dev` URL.

## Wire the Node app
In the Next app's `.env.local`:
```
SANDBOX_PROVIDER=cloudflare
SANDBOX_BRIDGE_URL=https://jarvisfactory-sandbox.<acct>.workers.dev
SANDBOX_BRIDGE_TOKEN=<same value as the worker secret>
```
`getSandboxDriver()` then returns `CloudflareSandboxDriver` instead of the stub.

## Notes
- Preview URLs use **quick tunnels** (`*.trycloudflare.com`) — no custom domain needed.
  For stable URLs on your own zone, switch `/start-dev` + `/preview` to `exposePort`
  with wildcard DNS (see the Cloudflare "Expose services" guide).
- Sandboxes auto-sleep after 30m idle (`sleepAfter`). `/destroy` permanently frees one.
- `instance_type` is `basic` (1/4 vCPU, 1 GiB) — bump to `standard-*` in `wrangler.jsonc`
  for heavier builds. Account limits: 6 TiB mem / 1,500 vCPU / 30 TB disk.
- Keep `Dockerfile` `FROM` version in sync with the `@cloudflare/sandbox` package version.

## Status
**Not yet deployed.** Scaffolded against `@cloudflare/sandbox@0.12.1`; unverified until
the founder completes the setup above on a Containers-enabled account.
