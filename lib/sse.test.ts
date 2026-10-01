import { describe, expect, it } from "vitest";

import { streamSse } from "@/lib/sse";

/** A Response whose body arrives in exactly these chunks. */
function chunked(...chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body);
}

async function collect<T>(response: Response): Promise<T[]> {
  const out: T[] = [];
  for await (const event of streamSse<T>(response)) out.push(event);
  return out;
}

describe("streamSse", () => {
  it("yields one parsed object per event", async () => {
    const events = await collect(chunked('data: {"a":1}\n\ndata: {"b":2}\n\n'));
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("reassembles an event split across chunks, even mid-character", async () => {
    const json = JSON.stringify({ text: "Café ✓" });
    const bytes = new TextEncoder().encode(`data: ${json}\n\n`);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        // Split inside the multi-byte "✓".
        c.enqueue(bytes.slice(0, bytes.length - 5));
        c.enqueue(bytes.slice(bytes.length - 5));
        c.close();
      },
    });
    expect(await collect(new Response(body))).toEqual([{ text: "Café ✓" }]);
  });

  it("handles CRLF line endings and ignores non-data fields", async () => {
    const events = await collect(chunked('event: x\r\nid: 1\r\ndata: {"ok":true}\r\n\r\n', ": comment\n\n"));
    expect(events).toEqual([{ ok: true }]);
  });

  it("joins multi-line data", async () => {
    const events = await collect(chunked('data: {"a":\ndata: 1}\n\n'));
    expect(events).toEqual([{ a: 1 }]);
  });

  it("drops a trailing event that never finished", async () => {
    const events = await collect(chunked('data: {"a":1}\n\ndata: {"partial"'));
    expect(events).toEqual([{ a: 1 }]);
  });

  it("yields nothing for an empty body", async () => {
    expect(await collect(new Response(null))).toEqual([]);
  });

  it("surfaces malformed JSON as an error rather than skipping it", async () => {
    await expect(collect(chunked("data: {nope\n\n"))).rejects.toThrow(SyntaxError);
  });
});
