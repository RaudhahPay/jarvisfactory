// TEMPORARY streaming smoke route — deleted in Task D4.
import { Hono } from 'hono';

export const smokeApp = new Hono();

smokeApp.get('/api/_smoke/stream', (c) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      send({ seq: 1 });
      await new Promise((r) => setTimeout(r, 5));
      send({ seq: 2 });
      controller.close();
    },
  });

  return c.body(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
});
