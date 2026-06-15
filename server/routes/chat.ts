// JARVIS chat proxy — keeps the Anthropic API key server-side (ported from Next.js).
// The browser calls /api/chat; this route forwards to api.anthropic.com using
// the ANTHROPIC_API_KEY from the server env. Never exposes the key to users.
// NOTE (B3): no auth/metering yet — Task C2 adds requireUser + the token meter.

import { Hono } from 'hono';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 10000;

const chatApp = new Hono();

chatApp.post('/api/chat', async (c) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return c.json(
      { error: { message: 'Server is missing ANTHROPIC_API_KEY in .env.local' } },
      500
    );
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: 'Invalid JSON in request body' } }, 400);
  }

  const { system, messages, max_tokens, model, tools, tool_choice } = body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: { message: '`messages` must be a non-empty array' } }, 400);
  }

  // v8.0: When tools are provided, return Anthropic's full response (including
  // tool_use blocks) without server-side accumulation. Tool-use loops are stateful
  // and need every block (text + tool_use) preserved for the next turn.
  const isAgentic = Array.isArray(tools) && tools.length > 0;

  try {
    // v7.6: Hybrid approach — stream from Anthropic for reliability (no idle timeouts),
    // but accumulate on the server and return ONE complete JSON to the browser.
    // v8.0: When tools are provided (agent mode), return ALL content blocks (text + tool_use)
    // not just text — the caller needs them for the next agent turn.
    const requestBody: any = {
      model: model || DEFAULT_MODEL,
      max_tokens: max_tokens || DEFAULT_MAX_TOKENS,
      system: system || '',
      messages,
      stream: true,
    };
    if (isAgentic) {
      requestBody.tools = tools;
      if (tool_choice) requestBody.tool_choice = tool_choice;
    }

    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!upstream.ok || !upstream.body) {
      let data: any;
      try {
        data = await upstream.json();
      } catch {
        data = { error: { message: `Anthropic ${upstream.status} ${upstream.statusText}` } };
      }
      return c.json(data, upstream.status as any);
    }

    // Consume the SSE stream server-side, reconstruct the FULL content array
    // (text blocks + tool_use blocks for agentic calls).
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const blocks: any[] = []; // index → { type: 'text', text: '' } or { type: 'tool_use', id, name, input: {} }
    const partialJson: Record<number, string> = {}; // accumulator for tool_use input JSON
    let usage: any = null;
    let stopReason: string | null = null;
    let upstreamErr: { type?: string; message: string } | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const block of events) {
        const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
        if (!dataLine) continue;
        const payload = dataLine.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.type === 'content_block_start') {
            const idx = parsed.index;
            const cb = parsed.content_block;
            if (cb?.type === 'text') {
              blocks[idx] = { type: 'text', text: '' };
            } else if (cb?.type === 'tool_use') {
              blocks[idx] = { type: 'tool_use', id: cb.id, name: cb.name, input: {} };
              partialJson[idx] = '';
            }
          } else if (parsed.type === 'content_block_delta') {
            const idx = parsed.index;
            if (parsed.delta?.type === 'text_delta' && blocks[idx]) {
              blocks[idx].text += parsed.delta.text;
            } else if (parsed.delta?.type === 'input_json_delta' && blocks[idx]) {
              partialJson[idx] = (partialJson[idx] || '') + (parsed.delta.partial_json || '');
            }
          } else if (parsed.type === 'content_block_stop') {
            const idx = parsed.index;
            if (blocks[idx]?.type === 'tool_use' && partialJson[idx] !== undefined) {
              const raw = partialJson[idx] || '{}';
              try {
                blocks[idx].input = JSON.parse(raw);
              } catch {
                // v8.1: JSON likely truncated — flag it so the agent loop can react.
                blocks[idx].input = {};
                blocks[idx]._truncated = true;
                blocks[idx]._partialJsonLength = raw.length;
              }
            }
          } else if (parsed.type === 'message_delta') {
            if (parsed.usage) usage = parsed.usage;
            if (parsed.delta?.stop_reason) stopReason = parsed.delta.stop_reason;
          } else if (parsed.type === 'error') {
            upstreamErr = {
              type: parsed.error?.type,
              message: parsed.error?.message || 'Anthropic stream error',
            };
          }
        } catch {
          /* ignore malformed event */
        }
      }
    }

    if (upstreamErr) {
      const status = /overloaded|rate_limit/.test(upstreamErr.type || '') ? 429 : 502;
      return c.json({ error: upstreamErr }, status);
    }

    const cleanBlocks = blocks.filter(Boolean);
    if (cleanBlocks.length === 0) {
      return c.json({ error: { message: 'Anthropic returned no content blocks' } }, 502);
    }

    return c.json({
      content: cleanBlocks,
      stop_reason: stopReason,
      usage,
      _server_streamed: true,
    });
  } catch (err: any) {
    return c.json({ error: { message: err?.message || 'Upstream request failed' } }, 502);
  }
});

export { chatApp };
