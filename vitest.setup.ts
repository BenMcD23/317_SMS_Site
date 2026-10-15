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
