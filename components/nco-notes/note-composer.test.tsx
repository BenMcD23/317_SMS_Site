// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import { NoteComposer } from "@/components/nco-notes/note-composer";
import { API_BASE } from "@/lib/config";

const NCOS = [
  { cin: 1, name: "Cpl Amy Able" },
  { cin: 2, name: "Sgt Ben Baker" },
];

let calls: { url: string; method: string; body: unknown }[];
let replies: Record<string, () => Response>;

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
  calls = [];
  replies = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = url.replace(API_BASE, "");
      calls.push({
        url: path,
        method: init.method ?? "GET",
        body: typeof init.body === "string" ? JSON.parse(init.body) : null,
      });
      return replies[path]?.() ?? new Response(JSON.stringify({ id: 9 }), { status: 201 });
    })
  );
});

function setup(props: Partial<React.ComponentProps<typeof NoteComposer>> = {}) {
  const onSaved = vi.fn();
  render(<NoteComposer ncos={NCOS} token="tok" voiceAvailable={false} onSaved={onSaved} {...props} />);
  return { onSaved };
}

const type = (label: string | RegExp, text: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });

describe("one NCO", () => {
  it("saves a typed note against the NCO tapped", async () => {
    const { onSaved } = setup();
    const save = screen.getByRole("button", { name: "Save note" });
    type("What did you see?", "Took the flight for drill");
    // Nothing to file it against yet.
    expect(save).toBeDisabled();
    expect(screen.getByText(/Tap the NCO/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sgt Ben Baker" }));
    expect(screen.getByRole("button", { name: "Sgt Ben Baker" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(save);

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({
      url: "/nco-notes",
      method: "POST",
      body: { cadet_cin: 2, body: "Took the flight for drill", source: "typed" },
    });
    expect(toast.success).toHaveBeenCalledWith("Saved for Sgt Ben Baker");
    // Ready for the next NCO.
    expect(screen.getByLabelText("What did you see?")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Sgt Ben Baker" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps what was typed when the save fails, and shows the API's reason", async () => {
    replies["/nco-notes"] = () =>
      new Response(JSON.stringify({ detail: "Ben Baker isn't in the NCO team" }), { status: 400 });
    const { onSaved } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Sgt Ben Baker" }));
    type("What did you see?", "Late again");
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Ben Baker isn't in the NCO team"));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("What did you see?")).toHaveValue("Late again");
  });

  it("on a profile, files every note against that NCO without asking", async () => {
    setup({ fixedCin: 1 });
    expect(screen.queryByRole("button", { name: "Sgt Ben Baker" })).toBeNull();
    expect(screen.queryByRole("radio", { name: /Several NCOs/ })).toBeNull();
    type("What did you see?", "Calm under pressure");
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(calls[0]?.body).toMatchObject({ cadet_cin: 1, body: "Calm under pressure" }));
  });

  it("hides the mic when the API can't transcribe, leaving the keyboard's own", () => {
    setup({ voiceAvailable: false });
    expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  });

  it("hides the mic when this browser can't record, even if the API could transcribe", () => {
    // jsdom has no MediaRecorder, like an old browser.
    setup({ voiceAvailable: true });
    expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  });
});

describe("speaking a note", () => {
  it("adds the transcript to what's typed and saves it as spoken", async () => {
    class Recorder {
      static isTypeSupported = () => true;
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", Recorder);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: async () => ({ getTracks: () => [] }) },
      configurable: true,
    });
    replies["/nco-notes/transcribe"] = () =>
      new Response(JSON.stringify({ text: "and kept them sharp.", model: "m", model_label: "M" }), {
        status: 200,
      });

    setup({ voiceAvailable: true, fixedCin: 1 });
    type("What did you see?", "Ran drill");
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    fireEvent.click(await screen.findByRole("button", { name: /Stop/ }));
    await waitFor(() =>
      expect(screen.getByLabelText("What did you see?")).toHaveValue("Ran drill and kept them sharp.")
    );

    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(calls.at(-1)?.url).toBe("/nco-notes"));
    expect(calls.at(-1)?.body).toMatchObject({ body: "Ran drill and kept them sharp.", source: "voice" });
  });
});

describe("several NCOs", () => {
  function sortReply(body: unknown, status = 200) {
    replies["/nco-notes/split"] = () => new Response(JSON.stringify(body), { status });
  }

  function openSeveral() {
    fireEvent.click(screen.getByRole("radio", { name: /Several NCOs/ }));
    type(/Tonight's notes/, "Amy great on drill, Ben late. Tea urn broken.");
    fireEvent.click(screen.getByRole("button", { name: "Sort into notes" }));
  }

  it("splits a debrief for checking, then saves the lot in one go", async () => {
    sortReply({
      notes: [
        { cin: 1, cadet_name: "Cpl Amy Able", body: "Great on drill." },
        { cin: 2, cadet_name: "Sgt Ben Baker", body: "Late." },
      ],
      unassigned: ["Tea urn broken."],
      model: "m",
      model_label: "M",
    });
    const { onSaved } = setup();
    openSeveral();

    expect(await screen.findByText("Check who each note is about")).toBeInTheDocument();
    expect(screen.getByLabelText("Note 1")).toHaveValue("Great on drill.");
    expect(screen.getByText("Tea urn broken.")).toBeInTheDocument();
    // Nothing saved until staff confirm.
    expect(calls.filter((c) => c.url === "/nco-notes/batch")).toEqual([]);

    type("Note 2", "Late, but warned the SNCO.");
    fireEvent.click(screen.getByRole("button", { name: "Save 2 notes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls.at(-1)).toMatchObject({
      url: "/nco-notes/batch",
      body: {
        source: "typed",
        notes: [
          { cadet_cin: 1, body: "Great on drill." },
          { cadet_cin: 2, body: "Late, but warned the SNCO." },
        ],
      },
    });
    // Back to an empty debrief for next time.
    expect(screen.getByLabelText(/Tonight's notes/)).toHaveValue("");
  });

  it("won't save a placed remark until it has an NCO", async () => {
    sortReply({
      notes: [{ cin: 1, cadet_name: "Cpl Amy Able", body: "Fine." }],
      unassigned: ["Who said this?"],
    });
    setup();
    openSeveral();
    fireEvent.click(await screen.findByRole("button", { name: "Add as a note" }));
    expect(screen.getByLabelText("Note 2")).toHaveValue("Who said this?");
    expect(screen.getByRole("button", { name: "Save 2 notes" })).toBeDisabled();

    // Removing it again makes the rest saveable.
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    expect(screen.getByRole("button", { name: "Save 1 note" })).toBeEnabled();
  });

  it("says so when the AI can't sort the notes, keeping the debrief", async () => {
    sortReply({ detail: "The AI couldn't sort those notes. Try again, or add them one NCO at a time." }, 502);
    setup();
    openSeveral();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("one NCO at a time"))
    );
    expect(screen.getByLabelText(/Tonight's notes/)).toHaveValue(
      "Amy great on drill, Ben late. Tea urn broken."
    );
  });

  it("says so when nothing in the debrief was about an NCO", async () => {
    sortReply({ notes: [], unassigned: [], model: "m", model_label: "M" });
    setup();
    openSeveral();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Try naming them")));
    expect(screen.queryByText("Check who each note is about")).toBeNull();
  });

  it("can start again from the review", async () => {
    sortReply({ notes: [{ cin: 1, cadet_name: "Cpl Amy Able", body: "Fine." }], unassigned: [] });
    setup();
    openSeveral();
    fireEvent.click(await screen.findByRole("button", { name: "Start again" }));
    expect(screen.getByLabelText(/Tonight's notes/)).toHaveValue(
      "Amy great on drill, Ben late. Tea urn broken."
    );
  });
});
