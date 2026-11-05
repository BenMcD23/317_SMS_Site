"use client";

import { useState, useEffect, useRef } from "react";

import { clearServerDraft, loadServerDraft, saveServerDraft, serverDraftIsNewer } from "@/lib/server-draft";
import type { DraftKind } from "@/lib/server-draft";

/** Where the last save to the server got to, for the note under the form. */
export type ServerSaveStatus = { state: "saving" } | { state: "saved"; at: string } | { state: "failed" };

type Options = {
  /** The signed-in id_token. Without it the draft stays on the phone only. */
  token?: string | null;
  /**
   * "auto" saves to the server a few seconds after each change (one-cadet
   * assessment forms). "manual" saves only when the page calls saveToServer,
   * which the inspection sheet does as each cadet is recorded.
   */
  serverSave?: "auto" | "manual";
  /** The pause after the last change before an "auto" save. */
  autosaveMs?: number;
};

const LOCAL_DEBOUNCE_MS = 500;
const AUTOSAVE_MS = 3000;

/**
 * An assessment form's state, kept as a draft on this phone (localStorage,
 * half a second after each change) and, given a token, on the server too, so a
 * cleared cache or a different device doesn't lose it. On load it restores the
 * phone's copy, then the server's if that was saved later. Shared by every
 * assessment sheet so they all keep work the same way.
 */
export function useAssessmentDraft<T extends object>(
  type: DraftKind,
  initial: T,
  userEmail: string | null | undefined,
  isMeaningful: (state: T) => boolean,
  { token, serverSave, autosaveMs = AUTOSAVE_MS }: Options = {}
) {
  const [state, setState] = useState<T>(initial);
  const [draftRestored, setDraftRestored] = useState(false);
  const [restoredFromServer, setRestoredFromServer] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerSaveStatus | null>(null);
  const emailRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);
  const serverCheckedRef = useRef(false);
  // Auto-saves wait until the server's copy has been looked at, so an older
  // copy on this phone can't overwrite a newer one saved from another device.
  const serverReadyRef = useRef(false);
  const autosaveWaitingRef = useRef(false);
  // When this phone's copy last changed (ISO), compared with the server's copy.
  const savedAtRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  const tokenRef = useRef(token);
  // Latest predicate for the debounced save, without making it a dependency.
  const isMeaningfulRef = useRef(isMeaningful);
  useEffect(() => {
    isMeaningfulRef.current = isMeaningful;
    tokenRef.current = token;
    stateRef.current = state;
  });

  const key = () => `assessment_draft_${type}_${emailRef.current ?? "anon"}`;
  // A clear the server didn't get (no signal after submitting): retried on the
  // next load, so a submitted sheet doesn't come back as a draft.
  const clearPendingKey = () => `${key()}:clear_pending`;

  function writeLocal(next: T, savedAt: string | null) {
    try {
      if (isMeaningfulRef.current(next)) {
        localStorage.setItem(key(), JSON.stringify(next));
        if (savedAt) localStorage.setItem(`${key()}:saved_at`, savedAt);
      } else {
        localStorage.removeItem(key());
        localStorage.removeItem(`${key()}:saved_at`);
      }
    } catch {}
  }

  useEffect(() => {
    if (!userEmail || loadedRef.current) return;
    loadedRef.current = true;
    emailRef.current = userEmail;

    try {
      const stored = localStorage.getItem(key());
      if (stored) {
        const parsed = JSON.parse(stored) as T;
        if (isMeaningfulRef.current(parsed)) {
          setState(parsed);
          stateRef.current = parsed;
          savedAtRef.current = localStorage.getItem(`${key()}:saved_at`);
          setDraftRestored(true);
        } else {
          localStorage.removeItem(key());
        }
      }
    } catch {}
    // key() reads emailRef, set above; type is its only other input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, userEmail]);

  function serverReady() {
    serverReadyRef.current = true;
    if (autosaveWaitingRef.current) {
      autosaveWaitingRef.current = false;
      void saveToServer();
    }
  }

  useEffect(
    () => () => {
      if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
    },
    []
  );

  /** Send this sheet (by default the current one) to the server now. */
  function saveToServer(next: T = stateRef.current): Promise<void> {
    const t = tokenRef.current;
    if (!t || !serverSave) return Promise.resolve();
    if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
    const savedAt = savedAtRef.current ?? new Date().toISOString();
    setServerStatus({ state: "saving" });
    return (
      (
        isMeaningfulRef.current(next)
          ? saveServerDraft(type, t, next, savedAt)
          : // Emptied by hand: nothing to keep, and a stale copy would come back.
            clearServerDraft(type, t)
      )
        .then(() => {
          // The server now holds this sheet (or nothing), so an older clear
          // still waiting to be sent must not wipe it on the next load.
          try {
            localStorage.removeItem(clearPendingKey());
          } catch {}
          setServerStatus(isMeaningfulRef.current(next) ? { state: "saved", at: savedAt } : null);
        })
        // Not retried on its own: the next change sends the whole sheet again,
        // and the phone keeps its own copy meanwhile.
        .catch(() => setServerStatus({ state: "failed" }))
    );
  }

  useEffect(() => {
    if (!serverSave || !token || !userEmail || !loadedRef.current || serverCheckedRef.current) return;
    serverCheckedRef.current = true;

    let clearPending = false;
    try {
      clearPending = localStorage.getItem(clearPendingKey()) === "1";
    } catch {}
    if (clearPending) {
      clearServerDraft(type, token)
        .then(() => {
          try {
            localStorage.removeItem(clearPendingKey());
          } catch {}
        })
        .catch(() => {})
        .finally(serverReady);
      return;
    }

    loadServerDraft<T>(type, token)
      .then((saved) => {
        // Compared with the phone's copy as it is now, not at mount: marking
        // may have started while this was loading.
        const local = { meaningful: isMeaningfulRef.current(stateRef.current), savedAt: savedAtRef.current };
        const server = saved && { meaningful: isMeaningfulRef.current(saved.data), savedAt: saved.saved_at };
        if (saved && serverDraftIsNewer(local, server)) {
          savedAtRef.current = saved.saved_at ?? new Date().toISOString();
          setState(saved.data);
          stateRef.current = saved.data;
          writeLocal(saved.data, savedAtRef.current);
          setRestoredFromServer(true);
        }
      })
      // Unreachable server: carry on with the phone's copy, as before there
      // was a server copy at all.
      .catch(() => {})
      .finally(serverReady);
    // key() reads emailRef; writeLocal only uses refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, token, userEmail, serverSave]);

  function setDraftState(action: React.SetStateAction<T>) {
    setState((prev) => {
      const next = typeof action === "function" ? (action as (s: T) => T)(prev) : action;
      // A form filling in its own defaults (the assessor's name on load) is
      // not new work: it mustn't make this copy look newer than the server's,
      // or send an empty form over a saved one.
      const isNewWork = isMeaningfulRef.current(next) && JSON.stringify(next) !== JSON.stringify(prev);
      const savedAt = isNewWork ? new Date().toISOString() : savedAtRef.current;
      savedAtRef.current = savedAt;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => writeLocal(next, savedAt), LOCAL_DEBOUNCE_MS);
      if (isNewWork && serverSave === "auto" && tokenRef.current) {
        if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
        serverTimerRef.current = setTimeout(() => {
          if (serverReadyRef.current) void saveToServer();
          else autosaveWaitingRef.current = true;
        }, autosaveMs);
      }
      return next;
    });
  }

  /**
   * Throw the draft away on this phone and the server (cleared, or submitted).
   * Resolves false when the server copy couldn't be removed; that is retried
   * on the next load.
   */
  function clearDraft(): Promise<boolean> {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
    autosaveWaitingRef.current = false;
    savedAtRef.current = null;
    setServerStatus(null);
    setRestoredFromServer(false);
    try {
      localStorage.removeItem(key());
      localStorage.removeItem(`${key()}:saved_at`);
    } catch {}
    const t = tokenRef.current;
    if (!t || !serverSave) return Promise.resolve(true);
    return clearServerDraft(type, t)
      .then(() => true)
      .catch(() => {
        try {
          localStorage.setItem(clearPendingKey(), "1");
        } catch {}
        return false;
      });
  }

  return {
    state,
    setState: setDraftState,
    clearDraft,
    draftRestored,
    restoredFromServer,
    saveToServer,
    serverStatus,
  };
}
