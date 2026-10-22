import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

// No matchMedia (jsdom, very old browsers) means "not mobile": the desktop
// layout still works on a phone, it's just less comfortable.
const canMatch = () => typeof window.matchMedia === "function";

function subscribe(onChange: () => void) {
  if (!canMatch()) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

// Server render and first client render agree on "not mobile"; the real value
// arrives synchronously after hydration, without a setState-in-effect.
export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => canMatch() && window.matchMedia(QUERY).matches,
    () => false
  );
}
