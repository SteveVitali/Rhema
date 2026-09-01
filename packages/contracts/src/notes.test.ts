import { describe, expect, it } from "vitest";
import { NOTE_TEMPLATE_IDS, NOTE_TEMPLATES, renderNote } from "./notes.js";

// REQ-ARCH-14: agent.note text comes ONLY from these templates, rendered from structured params — never raw
// model output or page text. Every rendered note is bounded ≤280 (REQ-DATA-37).

describe("agent.note templates (REQ-ARCH-14)", () => {
  it("renders bounded, template-only text for representative params", () => {
    expect(renderNote("checking_claims", { n: 12 })).toEqual({
      template: "checking_claims",
      text: "Checking 12 claims",
    });
    expect(renderNote("claims_progress", { checked: 5, of: 56, verified: 5 }).text).toBe(
      "Checked 5 of 56 claims · 5 verified",
    );
    expect(renderNote("boundary_clean", { paths: 214, denied: 0 }).text).toBe(
      "Read 214 paths, 0 denied — boundary held",
    );
  });

  it("every template renders ≤280 chars even at large numeric params", () => {
    for (const id of NOTE_TEMPLATE_IDS) {
      const schema = NOTE_TEMPLATES[id].params;
      // build a params object filling numbers with a big value and labels with a long-but-valid token
      const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
      const params: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        params[key] =
          key.includes("phase") || key.includes("section") || key.includes("domain")
            ? "x".repeat(40)
            : 999999999;
      }
      const { text } = renderNote(id, params as never);
      expect(text.length, `${id} note too long`).toBeLessThanOrEqual(280);
    }
  });

  it("rejects params outside the whitelist (no free-text passthrough)", () => {
    // a label with disallowed characters (looks like injected prose) is rejected
    expect(() => renderNote("fetching", { domain: "evil.com'; DROP <script>" } as never)).toThrow();
    // an unexpected extra field is ignored by zod object parse but numbers must be numbers
    expect(() => renderNote("checking_claims", { n: "lots" } as never)).toThrow();
  });
});
