"use client";

import { useState, useEffect, useRef } from "react";

export function useAssessmentDraft<T extends object>(
  type: string,
  initial: T,
  userEmail: string | null | undefined,
  isMeaningful: (state: T) => boolean
) {
  const [state, setState] = useState<T>(initial);
  const [draftRestored, setDraftRestored] = useState(false);
  const emailRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);
  const isMeaningfulRef = useRef(isMeaningful);
  isMeaningfulRef.current = isMeaningful;

  useEffect(() => {
    if (!userEmail || loadedRef.current) return;
    loadedRef.current = true;
    emailRef.current = userEmail;

    try {
      const stored = localStorage.getItem(`assessment_draft_${type}_${userEmail}`);
      if (stored) {
        const parsed = JSON.parse(stored) as T;
        if (isMeaningfulRef.current(parsed)) {
          setState(parsed);
          setDraftRestored(true);
        } else {
          localStorage.removeItem(`assessment_draft_${type}_${userEmail}`);
        }
      }
    } catch {}
  }, [type, userEmail]);

  function setDraftState(action: React.SetStateAction<T>) {
    setState((prev) => {
      const next = typeof action === "function" ? (action as (s: T) => T)(prev) : action;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const key = `assessment_draft_${type}_${emailRef.current ?? "anon"}`;
        try {
          if (isMeaningfulRef.current(next)) {
            localStorage.setItem(key, JSON.stringify(next));
          } else {
            localStorage.removeItem(key);
          }
        } catch {}
      }, 500);
      return next;
    });
  }

  function clearDraft() {
    if (timerRef.current) clearTimeout(timerRef.current);
    const key = `assessment_draft_${type}_${emailRef.current ?? "anon"}`;
    try {
      localStorage.removeItem(key);
    } catch {}
  }

  return { state, setState: setDraftState, clearDraft, draftRestored };
}
