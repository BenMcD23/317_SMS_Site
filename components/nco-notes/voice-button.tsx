"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, RotateCcw, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { pickRecordingType, transcribe } from "@/lib/nco-notes";

/** Long enough for an end-of-night debrief about the whole team; short
 *  enough that a recording left running in a pocket stops by itself. */
export const MAX_RECORDING_SECONDS = 180;

type State = "idle" | "recording" | "transcribing" | "failed";

/** Whether this browser can record at all. Without it the page falls back to
 *  typing, where the phone keyboard's own mic still works. */
export function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/**
 * Tap to record a voice note, tap again to stop; the text comes back through
 * `onText` for staff to check before saving. Tap rather than press-and-hold:
 * holding fights the phone's long-press menu and can't be done from a
 * keyboard, and a tap leaves the hand free while talking.
 *
 * A clip that fails to transcribe is kept, so "Try again" re-sends it instead
 * of asking staff to say it all again — the signal in a drill hall comes and
 * goes, and the moment being described won't happen twice.
 */
export function VoiceButton({
  token,
  onText,
  onError,
  disabled,
  label = "Record",
}: {
  token: string | undefined;
  onText: (text: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  // The last clip that failed to transcribe, kept for "Try again".
  const [failedClip, setFailedClip] = useState<Blob | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  function release() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }

  // Leaving the page mid-recording must turn the mic off, not leave the
  // browser's recording indicator on.
  useEffect(() => release, []);

  async function send(blob: Blob) {
    if (!token) return;
    setState("transcribing");
    try {
      const result = await transcribe(token, blob);
      setFailedClip(null);
      setState("idle");
      onText(result.text);
    } catch (e) {
      setFailedClip(blob);
      setState("failed");
      onError(e instanceof Error ? e.message : "Couldn't turn that recording into text.");
    }
  }

  async function start() {
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError(
        "The microphone is blocked. Allow it for this site in your browser settings, or type the note."
      );
      return;
    }
    const type = pickRecordingType((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(media, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    rec.onstop = () => {
      release();
      const blob = new Blob(chunks, { type: rec.mimeType || type || "audio/webm" });
      void send(blob);
    };
    stream.current = media;
    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setState("recording");
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_RECORDING_SECONDS) recorder.current?.stop();
        return s + 1;
      });
    }, 1000);
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  if (state === "recording") {
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    return (
      <Button type="button" onClick={stop} className="h-9" aria-live="polite">
        <Square className="fill-current" />
        Stop <span className="tabular-nums">{time}</span>
      </Button>
    );
  }
  if (state === "transcribing") {
    return (
      <Button type="button" variant="outline" disabled className="h-9">
        <Loader2 className="animate-spin" />
        Writing it up…
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-9"
        disabled={disabled || !token}
        onClick={() => void start()}
      >
        <Mic />
        {label}
      </Button>
      {state === "failed" && failedClip && (
        <Button type="button" variant="ghost" className="h-9" onClick={() => void send(failedClip)}>
          <RotateCcw />
          Try again
        </Button>
      )}
    </div>
  );
}
