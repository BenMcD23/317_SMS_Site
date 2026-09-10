"use client";

import { useState } from "react";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";

import { ApiStatusOverlay } from "@/components/api-status-overlay";

export function Providers({ children }: { children: React.ReactNode }) {
  // One QueryClient per browser session. staleTime keeps recently fetched data
  // "fresh" so navigating back to a page serves it instantly; gcTime keeps it
  // cached long enough to survive leaving the page and coming back.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 10 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    // The session carries the Google id_token the API authenticates with, and
    // that only lives an hour. Refetch often enough — and on tab focus — that
    // the browser never holds an expired one; a 401 here means a full redirect
    // through Google, which reads to the user as "logged out again".
    <SessionProvider refetchInterval={5 * 60}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-right" richColors />
          <ApiStatusOverlay />
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}