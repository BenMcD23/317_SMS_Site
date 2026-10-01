// Dates are formatted in local time; pin it so results don’t depend on the CI box.
process.env.TZ = "Europe/London";

import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans when test globals are on; they're off here.
afterEach(() => {
  cleanup();
});
