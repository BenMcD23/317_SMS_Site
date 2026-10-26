// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

import {
  discardQueued,
  flushOutbox,
  OUTBOX_EVENT,
  outboxFor,
  queueWrite,
  readOutbox,
  sendOrQueue,
} from "@/lib/outbox";

const ME = { token: "tok", owner: "nco@317atc.co.uk" };
const SHEET = {
  url: "http://api.test/assessments/radio/add-assessment",
  method: "POST",
  body: { a: 1 },
  label: "Radio",
};

function respond(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status });
}

function offline() {
  return vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  signIn.mockReset();
});

describe("sendOrQueue", () => {
  it("sends straight away when there is signal and hands back the server's answer", async () => {
    const fetch = vi.fn().mockResolvedValue(respond(200, { assessment_id: 7 }));
    vi.stubGlobal("fetch", fetch);
    const result = await sendOrQueue(SHEET, ME);
    expect(result.queued).toBe(false);
    expect(await (result as { res: Response }).res.json()).toEqual({ assessment_id: 7 });
    expect(fetch).toHaveBeenCalledWith(SHEET.url, {
      method: "POST",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: '{"a":1}',
    });
    expect(readOutbox()).toEqual([]);
  });

  it("keeps the sheet on the phone when the request can't get out", async () => {
    vi.stubGlobal("fetch", offline());
    const changed = vi.fn();
    window.addEventListener(OUTBOX_EVENT, changed);
    expect(await sendOrQueue(SHEET, ME)).toEqual({ queued: true });
    window.removeEventListener(OUTBOX_EVENT, changed);

    const [item] = readOutbox();
    expect(item).toMatchObject({ ...SHEET, owner: ME.owner });
    expect(item.id).toBeTruthy();
    expect(Date.parse(item.queuedAt)).not.toBeNaN();
    // The token expires in an hour; the queue may wait longer.
    expect(JSON.stringify(item)).not.toContain("tok");
    expect(changed).toHaveBeenCalled();
  });

  it.each([502, 503, 504])(
    "queues when the API host answers %i (the write never reached the API)",
    async (status) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(status)));
      expect(await sendOrQueue(SHEET, ME)).toEqual({ queued: true });
      expect(readOutbox()).toHaveLength(1);
    }
  );

  it.each([400, 403, 409, 422, 500])(
    "leaves a %i to the page: retrying won't change the server's mind",
    async (status) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(status, { detail: "No" })));
      const result = await sendOrQueue(SHEET, ME);
      expect(result.queued).toBe(false);
      expect((result as { res: Response }).res.status).toBe(status);
      expect(readOutbox()).toEqual([]);
    }
  );

  it("re-throws an error that isn't a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("bug")));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await expect(sendOrQueue(SHEET, ME)).rejects.toThrow("bug");
    expect(readOutbox()).toEqual([]);
  });

  it("says so when the sheet is too big to keep offline", async () => {
    vi.stubGlobal("fetch", offline());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    await expect(sendOrQueue(SHEET, ME)).rejects.toThrow("too big to keep on the phone");
  });
});

describe("flushOutbox", () => {
  function queue(n: number, owner = ME.owner) {
    return Array.from({ length: n }, (_, i) =>
      queueWrite({ ...SHEET, body: { n: i }, label: `Sheet ${i}`, owner })
    );
  }

  it("sends everything in order once the signal is back and empties the queue", async () => {
    queue(3);
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(respond(201)));
    vi.stubGlobal("fetch", fetch);
    const result = await flushOutbox("fresh-token", ME.owner);
    expect(result.sent.map((i) => i.label)).toEqual(["Sheet 0", "Sheet 1", "Sheet 2"]);
    expect(fetch.mock.calls.map(([, init]) => init.body)).toEqual(['{"n":0}', '{"n":1}', '{"n":2}']);
    // Sent with the token of now, not of when it was queued.
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer fresh-token");
    expect(readOutbox()).toEqual([]);
  });

  it("stops at the first item still without signal and keeps the rest", async () => {
    queue(3);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(respond(201)).mockRejectedValue(new TypeError("Failed to fetch"))
    );
    const result = await flushOutbox("t", ME.owner);
    expect(result.sent).toHaveLength(1);
    expect(readOutbox().map((i) => i.label)).toEqual(["Sheet 1", "Sheet 2"]);
  });

  it.each([429, 500, 503])("keeps everything for later on a %i", async (status) => {
    queue(2);
    const fetch = vi.fn().mockResolvedValue(respond(status));
    vi.stubGlobal("fetch", fetch);
    expect(await flushOutbox("t", ME.owner)).toEqual({ sent: [], refused: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(readOutbox()).toHaveLength(2);
  });

  it("marks a refused item with the server's reason, keeps it, and carries on", async () => {
    queue(2);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(respond(422, { detail: [{ msg: "cadet_cin: required" }] }))
        .mockResolvedValueOnce(respond(201))
    );
    const result = await flushOutbox("t", ME.owner);
    expect(result.refused.map((i) => i.error)).toEqual(["cadet_cin: required"]);
    expect(result.sent.map((i) => i.label)).toEqual(["Sheet 1"]);
    expect(readOutbox()).toMatchObject([{ label: "Sheet 0", error: "cadet_cin: required" }]);
  });

  it("does not retry an item the server has already refused", async () => {
    queue(1);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(409, {})));
    await flushOutbox("t", ME.owner);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await flushOutbox("t", ME.owner);
    expect(fetch).not.toHaveBeenCalled();
    expect(readOutbox()[0].error).toBe("Refused (409)");
  });

  it("never sends someone else's sheet with this person's token", async () => {
    queue(1, "other@317atc.co.uk");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await flushOutbox("t", ME.owner);
    expect(fetch).not.toHaveBeenCalled();
    expect(outboxFor("other@317atc.co.uk")).toHaveLength(1);
    expect(outboxFor(ME.owner)).toEqual([]);
  });

  it("runs one flush at a time so nothing is sent twice", async () => {
    queue(1);
    let release!: (r: Response) => void;
    const fetch = vi.fn().mockReturnValue(new Promise<Response>((r) => (release = r)));
    vi.stubGlobal("fetch", fetch);
    const first = flushOutbox("t", ME.owner);
    const second = flushOutbox("t", ME.owner);
    release(respond(201));
    expect(await first).toBe(await second);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops on a 401 rather than marking the sheet refused", async () => {
    queue(1);
    sessionStorage.setItem("sms:reauth-started-at", String(Date.now())); // re-auth already tried
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(401)));
    expect(await flushOutbox("t", ME.owner)).toEqual({ sent: [], refused: [] });
    expect(readOutbox()[0].error).toBeUndefined();
  });
});

describe("the stored queue", () => {
  it("survives garbage in storage", () => {
    localStorage.setItem("sms:outbox", "{not json");
    expect(readOutbox()).toEqual([]);
    localStorage.setItem("sms:outbox", '{"a":1}');
    expect(readOutbox()).toEqual([]);
  });

  it("discards one item and removes the key once empty", () => {
    const a = queueWrite({ ...SHEET, owner: ME.owner });
    const b = queueWrite({ ...SHEET, owner: ME.owner });
    discardQueued(a.id);
    expect(readOutbox().map((i) => i.id)).toEqual([b.id]);
    discardQueued(b.id);
    expect(localStorage.getItem("sms:outbox")).toBeNull();
  });

  it("has nothing for a signed-out user", () => {
    queueWrite({ ...SHEET, owner: ME.owner });
    expect(outboxFor(undefined)).toEqual([]);
  });
});
