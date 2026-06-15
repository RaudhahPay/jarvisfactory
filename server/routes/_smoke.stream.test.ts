import { describe, expect, it } from 'vitest';
import { smokeApp } from './_smoke.stream';

describe('SSE streaming smoke route', () => {
  it('streams >=2 data frames incrementally as text/event-stream', async () => {
    const res = await smokeApp.request('/api/_smoke/stream');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const frames: string[] = [];
    let reads = 0;

    while (true) {
      const { done, value } = await reader.read();
      reads++;
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const part of parts) {
        if (part.startsWith('data: ')) frames.push(part.slice(6));
      }
    }

    expect(frames.length).toBeGreaterThanOrEqual(2);
    // Each frame is valid JSON.
    for (const f of frames) expect(() => JSON.parse(f)).not.toThrow();
    // Delivered incrementally (more than a single read before done).
    expect(reads).toBeGreaterThan(1);
  });
});
