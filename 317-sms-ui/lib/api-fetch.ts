import { signIn } from "next-auth/react";

let isRedirecting = false;

export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const res = await fetch(url, options);

  if (res.status === 401 && !isRedirecting) {
    isRedirecting = true;
    await signIn("google", { callbackUrl: window.location.pathname });
    return new Promise(() => {});
  }

  return res;
}