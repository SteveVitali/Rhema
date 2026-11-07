// @vitest-environment happy-dom
//
// R7COPY.1a — REQ-GUARD-2(b): the DOM copy guard rejects a rendered snake_case
// workflow/phase/kind key anywhere in a mounted surface's TEXT (attributes — `data-*` — are not
// text; essay content is data and excluded). The guard is wired into `expectManifestEmission` for
// Element/Document scopes, so every SPA surface render parity leg runs it; these legs seed the
// failure mode directly.

import { describe, expect, it } from "vitest";
import { expectNoInternalKeys } from "./testkit.js";

const div = (html: string): HTMLElement => {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
};

describe("REQ-GUARD-2(b) — the no-internal-keys DOM guard", () => {
  it("a seeded `chat_turn` in rendered text fails", () => {
    const el = div(`<p>3 chat_turn, 2 review</p>`);
    expect(() => expectNoInternalKeys(el)).toThrow(/snake_case internal keys/);
  });
  it("a seeded phase/artifact-kind key fails too", () => {
    for (const key of ["second_read", "draft_ledger", "waiting_gate", "substack_export"]) {
      const el = div(`<span>${key}</span>`);
      expect(() => expectNoInternalKeys(el), key).toThrow(/snake_case internal keys/);
    }
  });
  it("the same key inside a data-* attribute is ignored (attributes are not rendered text)", () => {
    const el = div(`<div data-workflow="chat_turn"><span>Chat</span></div>`);
    expect(() => expectNoInternalKeys(el)).not.toThrow();
  });
  it("essay content (data-pm-host) is data — excluded from the scan", () => {
    const el = div(
      `<div data-pm-host><p>the run's chat_turn note</p></div><section>Review</section>`,
    );
    expect(() => expectNoInternalKeys(el)).not.toThrow();
  });
  it("a clean surface (labels only) passes", () => {
    const el = div(`<div><h1>Review</h1><p>3 Chat, 2 Research — Second read (independent)</p></div>`);
    expect(() => expectNoInternalKeys(el)).not.toThrow();
  });
});
