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
  DELIVERABLES: R2Bucket;
}

const WS = "/workspace";
const abs = (p: string) => {
  const r = String(p).replace(/^\/+/, "");
  if (r.split("/").includes("..")) throw new Error("path traversal rejected");
  return `${WS}/${r}`;
};
const rel = (p: string) => p.replace(new RegExp(`^${WS}/?`), "");

const b64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
};
const bytesToB64 = (buf: ArrayBuffer): string => {
  const a = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < a.length; i++) bin += String.fromCharCode(a[i]);
  return btoa(bin);
};

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
      const res = await sandbox.listFiles(dir);
      entries = res?.files || [];
    } catch {
      return;
    }
    for (const e of entries) {
      const full = e.absolutePath || `${dir}/${e.name}`;
      if (e.type === "directory") await walk(full);
      else if (e.type === "file") {
        try {
          const f = await sandbox.readFile(full);
          out.push({ path: rel(full), content: f.content });
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
    // Sandbox-independent: fetch a persisted deliverable from R2. Returns
    // { content: null } on miss so the Node driver gets null (not a thrown 404).
    if (url.pathname === "/r2-get") {
      const obj = await env.DELIVERABLES.get(String(body.key || ""));
      if (!obj) return json({ content: null });
      return json({ content: bytesToB64(await obj.arrayBuffer()) });
    }

    const id: string = body.id;
    if (!id) return json({ error: "id required" }, 400);

    // transport: "rpc" — sandbox.tunnels.* (preview URLs) requires the RPC transport.
    const sandbox = getSandbox(env.Sandbox, id, { sleepAfter: "30m", transport: "rpc" });

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
        case "/read-b64": {
          const f = await sandbox.readFile(abs(body.path), { encoding: "base64" });
          return json({ content: f.content, encoding: "base64" });
        }
        case "/write-b64": {
          for (const f of body.files || []) {
            const a = abs(f.path);
            const slash = a.lastIndexOf("/");
            if (slash > WS.length)
              await sandbox.mkdir(a.slice(0, slash), { recursive: true });
            await sandbox.writeFile(a, f.content, { encoding: "base64" });
          }
          return json({ ok: true });
        }
        case "/persist": {
          // Copy every deliverable in the workspace to R2 under <prefix>/<relpath>,
          // so binary outputs (docx/pptx/xlsx/pdf) survive sandbox sleep. Skips inputs.
          const prefix = String(body.prefix || "deliverables").replace(/\/+$/, "");
          const out: { path: string; size: number }[] = [];
          const walk = async (dir: string) => {
            let entries: any[] = [];
            try {
              const res = await sandbox.listFiles(dir);
              entries = res?.files || [];
            } catch {
              return;
            }
            for (const e of entries) {
              const full = e.absolutePath || `${dir}/${e.name}`;
              const r = rel(full);
              if (r.startsWith("uploads/") || r.startsWith("node_modules/") || r.startsWith(".git/")) continue;
              if (e.type === "directory") await walk(full);
              else if (e.type === "file") {
                try {
                  const f = await sandbox.readFile(full, { encoding: "base64" });
                  const bytes = b64ToBytes(f.content);
                  await env.DELIVERABLES.put(`${prefix}/${r}`, bytes);
                  out.push({ path: r, size: bytes.length });
                } catch {
                  /* skip unreadable */
                }
              }
            }
          };
          await walk(WS);
          return json({ files: out });
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
