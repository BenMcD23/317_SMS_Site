import { signIn } from "next-auth/react";

import { API_OUTAGE_EVENT } from "@/components/api-status-overlay";

let isRedirecting = false;

function flagPossibleOutage() {
  window.dispatchEvent(new Event(API_OUTAGE_EVENT));
}

export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (e) {
    // Network-level failure — likely the API is down; tell the overlay.
    flagPossibleOutage();
    throw e;
  }
  if ([502, 503, 504].includes(res.status)) flagPossibleOutage();

  if (res.status === 401 && !isRedirecting) {
    isRedirecting = true;
    await signIn("google", { callbackUrl: window.location.pathname });
    return new Promise(() => {});
  }

  return res;
}