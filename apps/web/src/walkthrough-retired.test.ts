import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

// R7COPY.0 (ADR-130; REQ-COPY-4) — the grep test the ticket asks for: no `run.walkthrough` enqueue,
// no consumer, no generator binding, no retry surface may survive under `apps/` + `packages/` source.
// The retained exclusions: the `runs.walkthrough` COLUMN (kept unread per ADR-130), the `walkthrough`
// artifact/document KIND (a real artifact still served on old dossiers), the ingest key's legacy
// fallback name (env.ts, deliberately kept so deployed stages resolve the same key), and comments that
// RECORD the retirement (an honest tombstone, not a live seam).

const FORBIDDEN: readonly { readonly pattern: string; readonly label: string }[] = [
  { pattern: "RUN_JOBS\\.walkthrough", label: "queue name" },
  { pattern: "maybeEnqueueWalkthrough", label: "lazy enqueue" },
  { pattern: "generateWalkthrough", label: "orchestrator generator" },
  { label: "worker generator binding", pattern: "loadWalkthroughGenerator" },
  { label: "anthropic walkthrough generator", pattern: "AnthropicWalkthroughGenerator" },
  { label: "retry route", pattern: "walkthrough/retry" },
  { label: "web retry path", pattern: "retryWalkthrough" },
  { label: "walkthrough state type", pattern: "WalkthroughState" },
  { label: "retry action", pattern: "retry_walkthrough" },
  { label: "env slot", pattern: "walkthroughModelKeySecret" },
];

describe("R7COPY.0 — the generated walkthrough is retired end-to-end (repo grep)", () => {
  for (const { pattern, label } of FORBIDDEN) {
    it(`no ${label} survives under apps/ + packages/`, () => {
      let out = "";
      try {
        out = execSync(
          `grep -rn "${pattern}" apps/*/src packages/*/src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "\\.test\\." | grep -v "retired\\|retires\\|R7COPY\\|ADR-130\\|walkthrough-retired" || true`,
          { cwd: process.cwd(), encoding: "utf8" },
        );
      } catch {
        out = "";
      }
      expect(out.trim(), out).toBe("");
    });
  }
});
