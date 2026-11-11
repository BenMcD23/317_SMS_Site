// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import { API_BASE } from "@/lib/config";
import {
  createNote,
  createNotes,
  deleteNote,
  editNote,
  groupByAppraisal,
  notesAsPoints,
  openNotes,
  pickRecordingType,
  splitDebrief,
  transcribe,
  type NcoNote,
} from "@/lib/nco-notes";

function note(overrides: Partial<NcoNote>): NcoNote {
  return {
    id: 1,
    cadet_cin: 10,
    cadet_name: "Cpl Amy Able",
    body: "Sharp on drill",
    note_date: "2026-10-01T00:00:00",
    source: "typed",
    author_name: "Sam Staff",
    is_mine: true,
    can_edit: true,
    can_delete: true,
    appraisal_id: null,
    appraisal_date: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe("the write calls", () => {
  let calls: { url: string; method: string; body: unknown }[];
  beforeEach(() => {
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, method: init.method ?? "GET", body: init.body });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      })
    );
  });

  it("hit the notes endpoints with the API's field names", async () => {
    await createNote("t", { cadet_cin: 10, body: "x", note_date: "2026-11-11", source: "voice" });
    await createNotes("t", [{ cadet_cin: 10, body: "x" }], "typed", "2026-11-11");
    await editNote("t", 5, { body: "y", cadet_cin: 11 });
    await deleteNote("t", 5);
    await splitDebrief("t", "Amy was great");
    expect(
      calls.map((c) => [c.method, c.url.replace(API_BASE, ""), c.body && JSON.parse(c.body as string)])
    ).toEqual([
      ["POST", "/nco-notes", { cadet_cin: 10, body: "x", note_date: "2026-11-11", source: "voice" }],
      [
        "POST",
        "/nco-notes/batch",
        { notes: [{ cadet_cin: 10, body: "x" }], source: "typed", note_date: "2026-11-11" },
      ],
      ["PUT", "/nco-notes/5", { body: "y", cadet_cin: 11 }],
      ["DELETE", "/nco-notes/5", undefined],
      ["POST", "/nco-notes/split", { text: "Amy was great" }],
    ]);
  });

  it("reject with the API's own message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "Jo Bloggs isn't in the NCO team" }), { status: 400 })
      )
    );
    await expect(createNote("t", { cadet_cin: 1, body: "x", source: "typed" })).rejects.toThrow(
      "Jo Bloggs isn't in the NCO team"
    );
  });
});

describe("transcribe", () => {
  it("uploads the clip as multipart with an extension Whisper can read", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ text: "Hello", model: "m", model_label: "M" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await transcribe("t", new Blob(["x"], { type: "audio/mp4" }));
    expect(result.text).toBe("Hello");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/nco-notes/transcribe`);
    const file = (init.body as FormData).get("audio") as File;
    expect(file.name).toBe("note.m4a");
    expect(file.type).toBe("audio/mp4");
    // No JSON content type: the browser must set the multipart boundary itself.
    expect(init.headers).toEqual({ Authorization: "Bearer t" });
  });

  it("passes on the API's reason when the transcriber is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ detail: "Try again, or type the note." }), { status: 502 })
      )
    );
    await expect(transcribe("t", new Blob(["x"], { type: "audio/webm" }))).rejects.toThrow("type the note");
  });

  it("says the server is unreachable when the request never lands", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline")))
    );
    await expect(transcribe("t", new Blob(["x"]))).rejects.toThrow("Server unreachable.");
  });

  it("falls back to a generic message when the error body isn't JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 500 }))
    );
    await expect(transcribe("t", new Blob(["x"]))).rejects.toThrow("Couldn't turn that recording into text.");
  });
});

describe("pickRecordingType", () => {
  it("takes WebM where the browser has it and MP4 on Safari", () => {
    expect(pickRecordingType(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickRecordingType((t) => t === "audio/mp4")).toBe("audio/mp4");
  });

  it("leaves the choice to the browser when it knows none of them", () => {
    expect(pickRecordingType(() => false)).toBe("");
  });
});

describe("notesAsPoints", () => {
  it("lists the notes oldest first with their dates, for the AI writer", () => {
    const points = notesAsPoints([
      note({ id: 2, body: "Later", note_date: "2026-10-08T00:00:00" }),
      note({ id: 1, body: " Earlier ", note_date: "2026-10-01T00:00:00" }),
      note({ id: 3, body: "No date", note_date: null }),
    ]);
    expect(points).toBe("- Undated: No date\n- 1 Oct 2026: Earlier\n- 8 Oct 2026: Later");
  });

  it("is empty for no notes", () => {
    expect(notesAsPoints([])).toBe("");
  });
});

describe("grouping a profile's notes", () => {
  it("puts the notes waiting for the next appraisal first, then each appraisal newest first", () => {
    const notes = [
      note({ id: 1, appraisal_id: 7, appraisal_date: "2025-06-01T00:00:00" }),
      note({ id: 2, appraisal_id: null }),
      note({ id: 3, appraisal_id: 9, appraisal_date: "2026-03-01T00:00:00" }),
      note({ id: 4, appraisal_id: 7, appraisal_date: "2025-06-01T00:00:00" }),
    ];
    const groups = groupByAppraisal(notes);
    expect(groups.map((g) => [g.appraisalId, g.notes.map((n) => n.id)])).toEqual([
      [null, [2]],
      [9, [3]],
      [7, [1, 4]],
    ]);
    expect(openNotes(notes).map((n) => n.id)).toEqual([2]);
  });

  it("has no groups for no notes", () => {
    expect(groupByAppraisal([])).toEqual([]);
  });
});
