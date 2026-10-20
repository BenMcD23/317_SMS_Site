"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";

/**
 * "Hide personal data" mode: masks contact details, dates of birth, addresses,
 * medical and bank details on screen, so the site can be shown on a projector
 * or a screen share without exposing them. Names, ranks and CINs stay visible —
 * the pages are useless without them.
 *
 * Staff only. SNCOs and NCOs are never sent other people's personal data in
 * the first place (the API strips it), so for them there is nothing to mask
 * and the setting is ignored: a staff member's choice left in a shared browser
 * mustn't turn an NCO's own phone number in Settings into dots.
 *
 * It is a display setting, not access control: the API still sends staff the
 * data and exports still contain it. Per browser, so localStorage is fine;
 * every read and write is guarded, and blocked storage just means "shown".
 */
const STORAGE_KEY = "sms.privacy.hide";
// The `storage` event only fires in *other* tabs, so this tab's own toggles
// are broadcast with an event of our own.
const CHANGE_EVENT = "sms-privacy-change";

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function setPersonalDataHidden(hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: nothing to remember it in, so the mode can't stick.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Whether personal data is hidden right now, and a setter. */
export function usePersonalDataHidden(): [boolean, (hidden: boolean) => void] {
  // The server can't see localStorage, so it renders "shown"; every page loads
  // its data client-side after hydration, so nothing personal flashes first.
  const stored = useSyncExternalStore(subscribe, read, () => false);
  const { data: session } = useSession();
  const hidden = stored && session?.role === "staff";
  const set = useCallback((value: boolean) => setPersonalDataHidden(value), []);
  return [hidden, set];
}
