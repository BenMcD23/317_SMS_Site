import type { MetadataRoute } from "next";

/**
 * Makes the site installable: "Add to Home Screen" gives an app that opens
 * full-screen, without the browser's address bar, straight onto the dashboard.
 * Served by Next at /manifest.webmanifest and linked from every page.
 *
 * The background is the dark theme's, the default, so the splash screen
 * doesn't flash white before the app paints.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "317 SMS",
    short_name: "317 SMS",
    description: "317 Squadron management system",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070c16",
    theme_color: "#070c16",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // The crest sits inside the central 80% a launcher keeps when it crops
      // an icon to its own shape, so the same art serves as the maskable one.
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Marking sheets", url: "/assessments/leadership" },
      { name: "Session plans", url: "/session-plans" },
    ],
  };
}
