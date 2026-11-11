// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import { MAX_RECORDING_SECONDS, VoiceButton } from "@/components/nco-notes/voice-button";

/** Just enough MediaRecorder: stop() hands over one chunk, then fires onstop. */
class FakeRecorder {
  static supported = ["audio/webm;codecs=opus"];
  static last: FakeRecorder | null = null;
  static isTypeSupported = (t: string) => FakeRecorder.supported.includes(t);
  state = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "";
    FakeRecorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["sound"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const track = { stop: vi.fn() };
let getUserMedia: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

function respond(status: number, body: unknown) {
  fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  track.stop.mockClear();
  getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }));
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const onText = vi.fn();
  const onError = vi.fn();
  render(<VoiceButton token="tok" onText={onText} onError={onError} />);
  return { onText, onError };
}

async function recordAndStop() {
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  const stop = await screen.findByRole("button", { name: /Stop/ });
  fireEvent.click(stop);
}

describe("VoiceButton", () => {
  it("records, stops, and hands back the transcript", async () => {
    respond(200, { text: "Amy was sharp on drill.", model: "m", model_label: "M" });
    const { onText, onError } = setup();
    await recordAndStop();
    await waitFor(() => expect(onText).toHaveBeenCalledWith("Amy was sharp on drill."));
    expect(onError).not.toHaveBeenCalled();
    // The mic is released as soon as recording stops.
    expect(track.stop).toHaveBeenCalled();
    const file = (fetchMock.mock.calls[0][1].body as FormData).get("audio") as File;
    expect(file.type).toBe("audio/webm;codecs=opus");
    expect(screen.getByRole("button", { name: "Record" })).toBeInTheDocument();
  });

  it("keeps a clip that failed so it can be sent again without re-recording", async () => {
    respond(502, { detail: "Couldn't turn that recording into text. Try again, or type the note." });
    respond(200, { text: "Second time lucky", model: "m", model_label: "M" });
    const { onText, onError } = setup();
    await recordAndStop();
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("type the note")));
    expect(onText).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(onText).toHaveBeenCalledWith("Second time lucky"));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("explains a blocked microphone instead of failing silently", async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    const { onError } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("microphone is blocked"))
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records Safari's MP4 when WebM isn't available", async () => {
    FakeRecorder.supported = ["audio/mp4"];
    respond(200, { text: "ok", model: "m", model_label: "M" });
    setup();
    await recordAndStop();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(FakeRecorder.last?.mimeType).toBe("audio/mp4");
    FakeRecorder.supported = ["audio/webm;codecs=opus"];
  });

  it("stops by itself if left running", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    respond(200, { text: "pocket", model: "m", model_label: "M" });
    const { onText } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await screen.findByRole("button", { name: /Stop/ });
    await act(async () => {
      vi.advanceTimersByTime(MAX_RECORDING_SECONDS * 1000);
    });
    await waitFor(() => expect(onText).toHaveBeenCalledWith("pocket"));
  });
});
