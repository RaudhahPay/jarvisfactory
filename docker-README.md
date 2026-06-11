# JarvisFactory — Docker Dev Setup

This lets anyone on the team run JarvisFactory locally with **identical tooling**, no "works on my machine" arguments.

## Prerequisites

1. **Docker Desktop** installed and running
   - Download: https://www.docker.com/products/docker-desktop/
   - Verify with: `docker --version`

2. **`.env.local` file** — created manually with your own secrets:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://jtvhhpnmpdduxlmikqtq.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-key>
   ANTHROPIC_API_KEY=sk-ant-api03-<your-key>
   ```

   ⚠️ Each developer creates their own `.env.local`. Never commit this file.

## First-time setup

```bash
cd jarvisfactory
docker compose build
```

Takes 1-3 minutes the first time (downloads Node, installs deps).
Future builds are seconds because of layer caching.

## Daily workflow

### Start the dev server

```bash
docker compose up
```

Wait for: `✓ Ready in X.Xs`

Then open: http://localhost:3000

### Stop the dev server

In the terminal running compose: `Ctrl+C`
Or from another terminal: `docker compose down`

### View logs

```bash
docker compose logs -f
```

### Rebuild after dependency changes

If you (or someone) updated `package.json`:

```bash
docker compose down
docker compose build
docker compose up
```

### Get a shell inside the running container

```bash
docker compose exec jarvisfactory sh
```

Useful for: running `npm install`, debugging files, checking env vars.

### Reset everything (nuclear option)

```bash
docker compose down -v
docker compose build --no-cache
docker compose up
```

## How it works

- **Dockerfile.dev** — recipe for building a Node 22 + your code image
- **docker-compose.yml** — wires the container, ports, volumes, env vars together
- **.dockerignore** — excludes node_modules, .git, secrets from the image

Your local `app/`, `lib/`, etc. are **mounted live into the container** via volumes — meaning every code change you save on your Mac shows up inside the container instantly. Hot reload still works.

`node_modules` is kept inside the container only (not synced to your Mac) for performance.

## Troubleshooting

| Issue | Fix |
|---|---|
| `port is already allocated` | Stop other processes on port 3000: `lsof -ti:3000 \| xargs kill` |
| Changes not showing | Make sure `WATCHPACK_POLLING=true` is in compose env |
| `Cannot find module` after `npm install` on Mac | Don't install on Mac. Run inside container: `docker compose exec jarvisfactory npm install` |
| Container won't start | Check logs: `docker compose logs jarvisfactory` |
| Slow performance on Mac | Already optimized — file changes use polling (necessary on macOS volume mounts) |

## What's NOT in this setup

- ❌ Production build (this is dev-only)
- ❌ Database (we use external Supabase, no local DB needed)
- ❌ Multi-service orchestration (single-service for now)

If/when we need those, we can add `Dockerfile.prod` and a separate compose file.
