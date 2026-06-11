// ============================================================
// JARVISFACTORY v2 / Stage 4 — S4: sandbox bridge Worker
// ============================================================
// Thin HTTP control surface over @cloudflare/sandbox. The Node-side
// CloudflareSandboxDriver (lib/sandbox/cloudflare-driver.ts) calls these endpoints;
// this Worker holds the env.Sandbox Durable Object binding and drives the SDK.
//
// Every project's files live under /workspace; the driver speaks relative paths and
// this Worker prefixes them. proxyToSandbox() must run first so preview-URL traffic
// reaches the right container. All endpoints require Authorization: Bearer <BRIDGE_TOKEN>.
//
// Deploy: see sandbox-worker/README.md (needs a Workers Paid plan with Containers).
// ============================================================

import { getSandbox, proxyToSandbox, type Sandbox } from "@cloudflare/sandbox";

export { Sandbox } from "@cloudflare/sandbox";

interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>;
  BRIDGE_TOKEN: string;
}

const WS = "/workspace";
const abs = (p: string) => {
  const r = String(p).replace(/^\/+/, "");
  if (r.split("/").includes("..")) throw new Error("path traversal rejected");
  return `${WS}/${r}`;
};
const rel = (p: string) => p.replace(new RegExp(`^${WS}/?`), "");

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Recursively snapshot the workspace as relative {path, content} text files.
async function snapshotWorkspace(
  sandbox: any,
): Promise<{ path: string; content: string }[]> {
  const out: { path: string; content: string }[] = [];
  async function walk(dir: string) {
    let entries: any[] = [];
    try {
      entries = await sandbox.listFiles(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory) await walk(e.path);
      else {
        try {
          const f = await sandbox.readFile(e.path);
          out.push({ path: rel(e.path), content: f.content });
        } catch {
          /* skip unreadable/binary */
        }
      }
    }
  }
  await walk(WS);
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. Preview-URL traffic → the running container. Must be first.
    const proxied = await proxyToSandbox(request, env);
    if (proxied) return proxied;

    const url = new URL(request.url);

    // 2. Auth — shared secret with the Node driver.
    const auth = request.headers.get("Authorization") || "";
    if (!env.BRIDGE_TOKEN || auth !== `Bearer ${env.BRIDGE_TOKEN}`) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (request.method !== "POST") return json({ error: "Use POST" }, 405);

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const id: string = body.id;
    if (!id) return json({ error: "id required" }, 400);

    const sandbox = getSandbox(env.Sandbox, id, { sleepAfter: "30m" });

    try {
      switch (url.pathname) {
        case "/create": {
          await sandbox.mkdir(WS, { recursive: true });
          for (const f of body.files || [])
            await sandbox.writeFile(abs(f.path), f.content);
          return json({ id, status: "running" });
        }
        case "/status":
          return json({ status: "running" });
        case "/write": {
          for (const f of body.files || []) {
            const a = abs(f.path);
            const slash = a.lastIndexOf("/");
            if (slash > WS.length)
              await sandbox.mkdir(a.slice(0, slash), { recursive: true });
            await sandbox.writeFile(a, f.content);
          }
          return json({ ok: true });
        }
        case "/read": {
          const f = await sandbox.readFile(abs(body.path));
          return json({ content: f.content });
        }
        case "/list": {
          const base = body.dir ? abs(body.dir) : WS;
          const snap = await snapshotWorkspace(sandbox);
          const files = body.dir
            ? snap.map((s) => s.path).filter((p) => p.startsWith(rel(base)))
            : snap.map((s) => s.path);
          return json({ files });
        }
        case "/delete":
          await sandbox.deleteFile(abs(body.path));
          return json({ ok: true });
        case "/exec": {
          const r = await sandbox.exec(body.command, {
            cwd: body.cwd || WS,
            env: body.env,
          });
          return json({
            exitCode: r.exitCode,
            stdout: r.stdout,
            stderr: r.stderr,
          });
        }
        case "/start-dev": {
          await sandbox.startProcess(`cd ${WS} && ${body.command}`);
          await sandbox.waitForPort(body.port).catch(() => {});
          const tunnel = await sandbox.tunnels.get(body.port);
          return json({ previewUrl: tunnel.url, port: body.port });
        }
        case "/stop-dev":
          await sandbox.tunnels.destroy(body.port).catch(() => {});
          return json({ ok: true });
        case "/preview": {
          const tunnel = await sandbox.tunnels.get(body.port);
          return json({ previewUrl: tunnel.url });
        }
        case "/snapshot":
          return json({ files: await snapshotWorkspace(sandbox) });
        case "/suspend":
          await sandbox.setKeepAlive(false);
          return json({ ok: true });
        case "/destroy":
          await sandbox.destroy();
          return json({ ok: true });
        default:
          return json({ error: `Unknown endpoint ${url.pathname}` }, 404);
      }
    } catch (err: any) {
      return json({ error: err?.message || "sandbox operation failed" }, 502);
    }
  },
};
