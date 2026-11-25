// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BarcodeScanner } from "@/components/barcode-scanner";

/** A camera whose one track records being stopped. */
function camera() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn(async () => stream);
  vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
  return { track, getUserMedia };
}

/** The browser's own reader, answering each frame with the next list of codes. */
function reader(frames: string[][]) {
  const Native = class {
    static getSupportedFormats = async () => ["code_128"];
    detect = vi.fn(async () => (frames.shift() ?? []).map((rawValue) => ({ rawValue })));
  };
  vi.stubGlobal("BarcodeDetector", Native);
}

beforeEach(() => {
  // jsdom has no media pipeline: a video is always "ready" and plays at once.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    set() {},
    get: () => null,
  });
});

describe("BarcodeScanner", () => {
  it("passes up every code the camera reads, and asks for the back camera", async () => {
    const { getUserMedia } = camera();
    reader([["8405998456634", "1"], [], ["EACH"]]);
    const seen: string[] = [];
    render(<BarcodeScanner onDetected={(c) => seen.push(c)} onClose={() => {}} />);

    await waitFor(() => expect(seen).toEqual(["8405998456634", "1", "EACH"]), { timeout: 2000 });
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: expect.objectContaining({ facingMode: "environment" }), audio: false })
    );
  });

  it("turns the camera off when it closes", async () => {
    const { track } = camera();
    reader([]);
    const { unmount } = render(<BarcodeScanner onDetected={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.queryByText("Starting the camera…")).not.toBeInTheDocument());
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it("a camera that's blocked says how to allow it, and to type instead", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(async () => Promise.reject(new DOMException("no", "NotAllowedError"))),
      },
    });
    render(<BarcodeScanner onDetected={() => {}} onClose={() => {}} />);
    expect(await screen.findByText(/camera is blocked for this site/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Camera view/)).not.toBeInTheDocument();
  });

  it("a browser with no camera access says to type the number", async () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: undefined });
    render(<BarcodeScanner onDetected={() => {}} onClose={() => {}} />);
    expect(await screen.findByText(/can't use the camera here/)).toBeInTheDocument();
  });

  it("any other camera failure is a plain 'couldn't start'", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(async () => Promise.reject(new DOMException("busy", "NotReadableError"))),
      },
    });
    render(<BarcodeScanner onDetected={() => {}} onClose={() => {}} />);
    expect(
      await screen.findByText("Couldn't start the camera. Type the stock number instead.")
    ).toBeInTheDocument();
  });

  it("a frame the reader chokes on is skipped, and reading carries on", async () => {
    camera();
    let calls = 0;
    vi.stubGlobal(
      "BarcodeDetector",
      class {
        static getSupportedFormats = async () => ["code_128"];
        detect = async () => {
          calls += 1;
          if (calls === 1) throw new Error("bad frame");
          return [{ rawValue: "8405998456634" }];
        };
      }
    );
    const seen: string[] = [];
    render(<BarcodeScanner onDetected={(c) => seen.push(c)} onClose={() => {}} />);
    await waitFor(() => expect(seen).toContain("8405998456634"), { timeout: 2000 });
  });

  it("Stop scanning closes it", async () => {
    camera();
    reader([]);
    const onClose = vi.fn();
    render(<BarcodeScanner onDetected={() => {}} onClose={onClose} />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Stop scanning" }));
    });
    expect(onClose).toHaveBeenCalled();
  });
});
