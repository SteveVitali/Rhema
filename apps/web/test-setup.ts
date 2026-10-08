// apps/web/test-setup.ts — Vitest setup file (SPA.7, REQ-VFY-1; wired via the root
// vitest.config.ts `setupFiles`). Registers jest-dom matchers (`toHaveAttribute`, `toBeInTheDocument`,
// …) and runs RTL `cleanup` after each test. Both are safe under the default `node` environment —
// the DOM guard keeps the node suite untouched; only `*.dom.test.{ts,tsx}` files (routed to
// happy-dom by `environmentMatchGlobs`) exercise the component stack.

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});
