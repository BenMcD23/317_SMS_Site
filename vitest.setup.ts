// Dates are formatted in local time; pin it so results don’t depend on the CI box.
process.env.TZ = "Europe/London";

import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach } from "vitest";

// Animations finish at once, so a collapsed panel is gone when the test looks.
MotionGlobalConfig.skipAnimations = true;

// Testing Library only auto-cleans when test globals are on; they're off here.
afterEach(() => {
  cleanup();
});

// jsdom lacks the browser APIs the searchable pickers (cmdk) and the menu
// lean on. No-op versions, set once and only where missing, so a test can
// still stub its own with vi.stubGlobal.
if (typeof window !== "undefined") {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function () {};
}
