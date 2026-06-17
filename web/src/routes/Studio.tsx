// ============================================================
// ezclaude — unified Studio (Ask | Create | Build)
// ============================================================
// One web app, three no-code modes on the shared engine. All three stream from the
// server (SSE) via apiFetch, which attaches the user's Supabase Bearer so RLS
// resolves to them.
//   Ask    /api/agent/chat   (conversation)
//   Create /api/agent/cowork (agent + skills downloadable deliverables)
//   Build  /api/build        (agent builds a real app in a sandbox)
// ============================================================

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "@/web/src/lib/supabase";
import { apiFetch } from "@/web/src/lib/api";
import { MODELS, DEFAULT_MODEL } from "@/lib/models";
import { theme, ui } from "@/web/src/lib/theme";

type Mode = "chat" | "cowork" | "build";
type Line = { role: "user" | "assistant" | "log"; text: string };
type Attachment = { name: string; type: string; data: string };
type Convo = {
  id: string;
  mode: Mode;
  title: string;
  app_id?: string;
  updated_at: string;
};
type SessionState = {
  lines?: Line[];
  conversationId?: string;
  appId?: string;
  deliverables?: string[];
  previewUrl?: string;
};

// Read a browser File into the {name, type, base64} shape the routes expect.
function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        data: s.slice(s.indexOf(",") + 1),
      });
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Studio's palette, mapped onto the canonical Landing design tokens (theme.ts)
// so the working app surface speaks the same visual language as the marketing
// page: teal accent, ink text, white + off-white surfaces, hairline borders,
// Plus Jakarta Sans.
const C = {
  bg: theme.color.bg, // white page
  surface: theme.color.surface, // off-white (sidebar / inputs / assistant bubbles)
  surfaceWarm: theme.color.surfaceWarm, // warm panel (composer)
  panel: "#fff", // white cards
  border: theme.color.border, // hairline
  borderInput: theme.color.borderInput, // input / outline border
  teal: theme.color.accent,
  violet: theme.color.accentAlt,
  ink: theme.color.ink,
  text: theme.color.ink,
  dim: theme.color.muted,
  faint: theme.color.faint,
  sans: theme.font.sans,
  mono: theme.font.sans,
  tealSoft: "rgba(16,185,129,0.10)",
  violetSoft: "rgba(123,111,255,0.10)",
};

// Minimal SSE reader: POST via apiFetch + stream `data: {json}` lines onEvent.
// apiFetch attaches the user's access token so server routes resolve RLS to them.
async function streamPost(
  url: string,
  body: any,
  onEvent: (e: any) => void,
) {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() || "";
    for (const f of frames) {
      const line = f.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {}
    }
  }
}

export default function StudioPage() {
  const navigate = useNavigate();
  const supabase = getSupabase();
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("chat");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [appId, setAppId] = useState<string | undefined>();
  const [deliverables, setDeliverables] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Per-mode session buckets so switching tabs keeps each thread intact.
  const sessionsRef = useRef<Record<Mode, SessionState>>({
    chat: {},
    cowork: {},
    build: {},
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate("/auth");
      else {
        setReady(true);
        fetchConvos();
      }
    });
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  function switchMode(m: Mode) {
    if (m === mode || busy) return;
    // Snapshot the outgoing tab's thread, then restore the incoming tab's.
    sessionsRef.current[mode] = {
      lines,
      conversationId,
      appId,
      deliverables,
      previewUrl,
    };
    const s = sessionsRef.current[m] || {};
    setMode(m);
    setLines(s.lines || []);
    setConversationId(s.conversationId);
    setAppId(s.appId);
    setDeliverables(s.deliverables || []);
    setPreviewUrl(s.previewUrl);
  }

  async function fetchConvos() {
    try {
      const res = await apiFetch("/api/conversations", {});
      if (res.ok) setConvos((await res.json()).conversations || []);
    } catch {}
  }

  function newChat() {
    setLines([]);
    setConversationId(undefined);
    setAppId(undefined);
    setDeliverables([]);
    setPreviewUrl(undefined);
    setInput("");
    setAttachments([]);
  }

  // Reload a past thread: restore mode, ids, messages, and any deliverable links.
  async function loadConvo(c: Convo) {
    if (busy) return;
    // Preserve the current tab's thread before loading another one.
    sessionsRef.current[mode] = { lines, conversationId, appId, deliverables, previewUrl };
    try {
      const res = await apiFetch(`/api/conversations/${c.id}`, {});
      if (!res.ok) return;
      const data = await res.json();
      setMode((data.mode as Mode) || c.mode);
      setConversationId(c.id);
      setAppId(data.app_id || c.app_id);
      setPreviewUrl(undefined);
      const msgs: Line[] = (data.messages || [])
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any) => ({ role: m.role, text: m.content }));
      setLines(msgs);
      // Repopulate Cowork download chips from the latest assistant message's manifest.
      const lastMeta = [...(data.messages || [])]
        .reverse()
        .find((m: any) => m.role === "assistant" && m.meta?.deliverables);
      setDeliverables(lastMeta?.meta?.deliverables || []);
    } catch {}
  }

  const addLine = (role: Line["role"], text: string) =>
    setLines((l) => [...l, { role, text }]);

  async function copyText(text: string, i: number) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts / older browsers.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {}
      document.body.removeChild(ta);
    }
    setCopiedIdx(i);
    setTimeout(() => setCopiedIdx((c) => (c === i ? null : c)), 1300);
  }

  async function pickFiles(list: FileList | null) {
    if (!list || !list.length) return;
    const next = await Promise.all(Array.from(list).map(fileToAttachment));
    setAttachments((a) => [...a, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    const atts = attachments;
    setInput("");
    setAttachments([]);
    setBusy(true);
    addLine(
      "user",
      atts.length
        ? `${text}${text ? "\n" : ""}${atts.map((a) => a.name).join(", ")}`
        : text,
    );

    try {
      if (mode === "chat") {
        let asst = "";
        addLine("assistant", "");
        await streamPost(
          "/api/agent/chat",
          { conversationId, message: text, model, attachments: atts },
          (e) => {
            if (e.type === "conversation") setConversationId(e.conversationId);
            else if (e.type === "text") {
              asst += e.text;
              setLines((l) =>
                l.map((ln, i) =>
                  i === l.length - 1 ? { ...ln, text: asst } : ln,
                ),
              );
            } else if (e.type === "error") addLine("log", "" + e.message);
          },
        );
      } else if (mode === "cowork") {
        await streamPost(
          "/api/agent/cowork",
          { conversationId, appId, task: text, model, attachments: atts },
          (e) => {
            if (e.type === "meta") {
              setConversationId(e.conversationId);
              setAppId(e.appId);
            } else if (e.type === "tool_use")
              addLine(
                "log",
                `${String(e.tool).replace(/^mcp__sandbox__/, "")}`,
              );
            else if (e.type === "exec") addLine("log", `$ ${e.command}`);
            else if (e.type === "file_edit") {
              addLine("log", `${e.action} ${e.path}`);
              setDeliverables((d) => (d.includes(e.path) ? d : [...d, e.path]));
            } else if (e.type === "text" && e.text?.trim())
              addLine("assistant", e.text);
            else if (e.type === "error") addLine("log", "" + e.message);
          },
        );
      } else {
        // build — create an app (project) then run the agent build, all in-page
        let id = appId;
        if (!id) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const { data, error } = await supabase
            .from("apps")
            .insert({
              user_id: user!.id,
              name: text.slice(0, 60),
              description: text.slice(0, 200),
            })
            .select("id")
            .single();
          if (error || !data) {
            addLine(
              "log",
              "Could not create project: " + (error?.message || "unknown"),
            );
            setBusy(false);
            return;
          }
          id = data.id as string;
          setAppId(id);
        }
        await streamPost(
          "/api/build",
          { appId: id, prompt: text, model, attachments: atts },
          (e) => {
            if (e.type === "tool_use")
              addLine(
                "log",
                `${String(e.tool).replace(/^mcp__sandbox__/, "")}`,
              );
            else if (e.type === "exec") addLine("log", `$ ${e.command}`);
            else if (e.type === "file_edit")
              addLine("log", `${e.action} ${e.path}`);
            else if (e.type === "text" && e.text?.trim())
              addLine("assistant", e.text);
            else if (e.type === "error") addLine("log", "" + e.message);
          },
        );
        // pull the live preview URL the build saved
        const { data: app } = await supabase
          .from("apps")
          .select("preview_url")
          .eq("id", id)
          .single();
        if (app?.preview_url) setPreviewUrl(app.preview_url);
        addLine("log", "Build finished.");
      }
    } catch (err: any) {
      addLine("log", "" + (err?.message || "failed"));
    } finally {
      setBusy(false);
      fetchConvos();
    }
  }

  if (!ready)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          color: C.dim,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: C.sans,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Loading ezclaude…
      </div>
    );

  const tabs: {
    id: Mode;
    label: string;
    hint: string;
    ph: string;
    empty: string;
  }[] = [
    {
      id: "chat",
      label: "Ask",
      hint: "Chat with Claude — ask anything",
      ph: "Message Claude…",
      empty: "Ask Claude anything — questions, drafts, ideas, explanations.",
    },
    {
      id: "cowork",
      label: "Create",
      hint: "Make documents, decks, sheets, PDFs — no code",
      ph: "Describe the document/deck/sheet you want…",
      empty:
        "Describe what you want and Claude makes the file: “a 5-slide deck on X”, “turn this into a spreadsheet”, “a welcome letter as a Word doc”.",
    },
    {
      id: "build",
      label: "Build",
      hint: "Build & launch a real app — no code",
      ph: "Describe the app you want to build…",
      empty:
        "Describe an app and Claude builds it in a live sandbox: “a habit tracker with a dark theme”, “a landing page for my coffee brand”.",
    },
  ];
  const cur = tabs.find((t) => t.id === mode)!;

  return (
    <div
      style={{
        height: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: C.sans,
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
      }}
    >
      {sidebarOpen && (
        <aside
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: `1px solid ${C.border}`,
            display: "flex",
            flexDirection: "column",
            background: C.surface,
          }}
        >
          <div style={{ padding: 14, borderBottom: `1px solid ${C.border}` }}>
            <button
              onClick={newChat}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: theme.radius.button,
                border: "none",
                background: C.ink,
                color: "#fff",
                fontFamily: C.sans,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + New
            </button>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {convos.length === 0 && (
              <div style={{ color: C.faint, fontSize: 12, padding: 8 }}>
                No history yet.
              </div>
            )}
            {convos.map((c) => {
              const icon =
                c.mode === "cowork" ? "" : c.mode === "build" ? "" : "";
              const active = c.id === conversationId;
              return (
                <button
                  key={c.id}
                  onClick={() => loadConvo(c)}
                  title={c.title}
                  style={{
                    textAlign: "left",
                    padding: "9px 11px",
                    borderRadius: theme.radius.pill,
                    border: `1px solid ${active ? C.border : "transparent"}`,
                    background: active ? "#fff" : "transparent",
                    boxShadow: active ? theme.shadow.card : "none",
                    color: active ? C.ink : C.dim,
                    fontFamily: C.sans,
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {icon} {c.title || "Untitled"}
                </button>
              );
            })}
          </div>
        </aside>
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "14px 24px",
            borderBottom: `1px solid ${C.border}`,
            background: C.bg,
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            title="Toggle history"
            style={{
              background: "#fff",
              border: `1px solid ${C.border}`,
              borderRadius: theme.radius.pill,
              color: C.dim,
              cursor: "pointer",
              padding: "5px 10px",
              fontSize: 14,
            }}
          >
            
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={ui.logoMark} />
            <span
              style={{ fontWeight: 800, color: C.ink, letterSpacing: -0.5, fontSize: 18 }}
            >
              ezclaude
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => switchMode(t.id)}
                disabled={busy}
                title={t.hint}
                style={{
                  padding: "8px 14px",
                  borderRadius: theme.radius.pill,
                  cursor: busy ? "default" : "pointer",
                  fontFamily: C.sans,
                  fontSize: 13,
                  fontWeight: 600,
                  border: `1px solid ${mode === t.id ? "transparent" : C.border}`,
                  background: mode === t.id ? C.ink : "#fff",
                  color: mode === t.id ? "#fff" : C.dim,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 12, color: C.dim, fontWeight: 500 }}>{cur.hint}</span>
            <a
              href="/dashboard"
              target="_blank"
              rel="noreferrer"
              title="Your previously built apps (opens in a new tab)"
              style={{ fontSize: 12, color: C.ink, fontWeight: 600, textDecoration: "none", border: `1px solid ${C.borderInput}`, background: "#fff", borderRadius: theme.radius.button, padding: "7px 12px", whiteSpace: "nowrap" }}
            >
              My Apps 
            </a>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={busy}
              title="Choose the Claude model"
              style={{
                background: "#fff",
                color: C.ink,
                border: `1px solid ${C.borderInput}`,
                borderRadius: theme.radius.button,
                padding: "7px 10px",
                fontFamily: C.sans,
                fontSize: 12,
                fontWeight: 500,
                outline: "none",
                cursor: busy ? "default" : "pointer",
              }}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.blurb}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "28px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            background: C.surface,
          }}
        >
          {lines.length === 0 && (
            <div
              style={{
                margin: "auto",
                textAlign: "center",
                color: C.dim,
                maxWidth: 460,
              }}
            >
              <div style={{ ...ui.logoMark, width: 44, height: 44, borderRadius: 13, margin: "0 auto" }} />
              <div style={{ fontSize: 15, marginTop: 16, color: C.dim, lineHeight: 1.55 }}>{cur.empty}</div>
            </div>
          )}
          {lines.map((ln, i) => (
            <div
              key={i}
              style={{
                alignSelf: ln.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  padding: ln.role === "log" ? "4px 10px" : "11px 15px",
                  borderRadius:
                    ln.role === "log" ? 8 : theme.radius.card,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: ln.role === "log" ? 12 : 14,
                  fontFamily:
                    ln.role === "log"
                      ? "ui-monospace, 'SF Mono', monospace"
                      : C.sans,
                  lineHeight: 1.55,
                  background:
                    ln.role === "user"
                      ? C.ink
                      : ln.role === "log"
                        ? "transparent"
                        : "#fff",
                  border:
                    ln.role === "log"
                      ? "none"
                      : ln.role === "user"
                        ? "none"
                        : `1px solid ${C.border}`,
                  boxShadow:
                    ln.role === "assistant" ? theme.shadow.card : "none",
                  color:
                    ln.role === "log"
                      ? C.faint
                      : ln.role === "user"
                        ? "#fff"
                        : C.text,
                }}
              >
                {ln.text || (busy ? "…" : "")}
              </div>
              {ln.role !== "log" && ln.text && (
                <button
                  onClick={() => copyText(ln.text, i)}
                  title="Copy"
                  style={{
                    marginTop: 5,
                    alignSelf: ln.role === "user" ? "flex-end" : "flex-start",
                    display: "block",
                    background: "none",
                    border: "none",
                    color: copiedIdx === i ? C.teal : C.faint,
                    cursor: "pointer",
                    fontFamily: C.sans,
                    fontWeight: 500,
                    fontSize: 11,
                    padding: 0,
                  }}
                >
                  {copiedIdx === i ? "copied" : "⧉ copy"}
                </button>
              )}
            </div>
          ))}
          {busy && (
            <div
              style={{ alignSelf: "flex-start", color: C.teal, fontSize: 12, fontWeight: 600 }}
            >
              working…
            </div>
          )}
        </div>

        {mode === "cowork" && deliverables.length > 0 && (
          <div
            style={{
              padding: "10px 24px",
              borderTop: `1px solid ${C.border}`,
              background: C.bg,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>Files:</span>
            {deliverables.map((d) => (
              <a
                key={d}
                href={
                  appId
                    ? `/api/agent/file?appId=${appId}&path=${encodeURIComponent(d)}`
                    : "#"
                }
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.ink,
                  textDecoration: "none",
                  border: `1px solid ${C.borderInput}`,
                  background: "#fff",
                  borderRadius: theme.radius.pill,
                  padding: "5px 11px",
                }}
              >
                {d}
              </a>
            ))}
          </div>
        )}
        {mode === "build" && previewUrl && (
          <div
            style={{
              padding: "10px 24px",
              borderTop: `1px solid ${C.border}`,
              background: C.bg,
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>Live preview:</span>
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, color: C.teal, fontWeight: 600 }}
            >
              {previewUrl} 
            </a>
          </div>
        )}

        {attachments.length > 0 && (
          <div
            style={{
              padding: "12px 24px 0",
              background: C.bg,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {attachments.map((a, i) => (
              <span
                key={i}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: C.ink,
                  border: `1px solid ${C.borderInput}`,
                  background: "#fff",
                  borderRadius: theme.radius.pill,
                  padding: "5px 11px",
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                {a.name}
                <button
                  onClick={() =>
                    setAttachments((list) => list.filter((_, j) => j !== i))
                  }
                  style={{
                    background: "none",
                    border: "none",
                    color: C.faint,
                    cursor: "pointer",
                    fontSize: 13,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div
          style={{
            padding: 18,
            borderTop: `1px solid ${C.border}`,
            background: C.bg,
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
          }}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.csv,.json,.docx,.xlsx,.pptx,.zip"
            onChange={(e) => pickFiles(e.target.files)}
            style={{ display: "none" }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title="Attach documents, images, or a zip for Claude to study"
            style={{
              padding: "0 16px",
              height: 48,
              borderRadius: theme.radius.button,
              border: `1px solid ${C.borderInput}`,
              background: "#fff",
              color: C.dim,
              cursor: busy ? "default" : "pointer",
              fontSize: 16,
            }}
          >
            
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={cur.ph}
            rows={2}
            style={{
              flex: 1,
              resize: "none",
              background: C.surfaceWarm,
              border: `1px solid ${C.borderInput}`,
              borderRadius: theme.radius.button,
              color: C.text,
              padding: "13px 15px",
              fontFamily: C.sans,
              fontSize: 15,
              lineHeight: 1.5,
              outline: "none",
            }}
          />
          <button
            onClick={send}
            disabled={busy || (!input.trim() && attachments.length === 0)}
            style={{
              padding: "0 24px",
              height: 48,
              borderRadius: theme.radius.button,
              border: "none",
              cursor: busy ? "default" : "pointer",
              background: busy ? C.border : C.ink,
              color: busy ? C.dim : "#fff",
              fontFamily: C.sans,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {busy ? "…" : "Send "}
          </button>
        </div>
      </div>
    </div>
  );
}
