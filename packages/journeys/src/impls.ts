// The step-implementation registry the runner consumes — the base map plus the STB.5a BL-21/BL-22
// live-leg map (kept out of steps.ts to avoid a steps↔stb5a import cycle: stb5a.ts reuses
// steps.ts's exported helpers).

import { STEP_IMPLS } from "./steps.js";
import { STB5A_IMPLS } from "./stb5a.js";
import { STB5B_IMPLS } from "./stb5b.js";
import type { StepFn } from "./runner.js";

export const ALL_IMPLS: Readonly<Record<string, StepFn>> = {
  ...STEP_IMPLS,
  ...STB5A_IMPLS,
  ...STB5B_IMPLS,
};
