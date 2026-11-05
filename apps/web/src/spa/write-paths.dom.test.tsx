// R7RELOAD.1 (REQ-RELOAD-2) — the shared grammar's accept/reject contract and the delegated
// submit's interception rules, in the DOM the chrome host mounts under.

import { describe, expect, it } from "vitest";
import { SPA_WRITE, delegatedSubmitHandler } from "./write-paths.js";

describe("REQ-RELOAD-2 — one shared write allowlist", () => {
  it("SPA_WRITE covers the union of the retired surface grammars", () => {
    const accept = [
      "/p/a/review/r1/findings/f1/disposition",
      "/p/a/findings/f1/apply",
      "/p/a/review/r1/findings/bulk",
      "/p/a/review/r1/findings/bulk-preview",
      "/p/a/gates/g1",
      "/p/a/obligations",
      "/p/a/edit/d1/note",
      "/p/a/edit/d1/cancel-run",
      "/p/a/edit/d1/revise",
      "/p/a/v/2/restore/rp1",
      "/p/a/v/2/diff/3/hunks/h1/comments",
      "/p/a/revisions/c1/hunks/h1/comments",
      "/p/a/rename",
      "/p/a/approval-overrides",
      "/p/a/voice",
      "/p/a/voice/adopt",
      "/p/a/voice/fork",
      "/p/a/decisions/d1",
      "/p/a/r/run1/refund",
      // the pane-body writes the surface handlers could never see (T3):
      "/p/a/explainers/approvals/dismiss",
      "/p/a/r/run1/pause",
      "/p/a/r/run1/stop",
      "/p/a/r/run1/note",
    ];
    for (const p of accept) expect(SPA_WRITE.test(p), p).toBe(true);
    const reject = [
      "/p/a/chat/turns", // chat forms are excluded — 232 owns their mutation
      "/p/a/chat/notes",
      "/p/a/export", // the binary download stays a native form post
      "/p/a/run", // the run sheet's own submit arm owns its interception
      "/app/new/create",
      "/logout",
      "/v/p1/samples",
      "/p/a/f/f1", // binary passthrough
      "/other",
    ];
    for (const p of reject) expect(SPA_WRITE.test(p), p).toBe(false);
  });

  it("the delegated handler intercepts an allowlisted POST and skips everything else", () => {
    document.body.innerHTML = "";
    const posted: { action: string; json: Record<string, string | string[]> }[] = [];
    let navigated: string | null = null;
    const handler = delegatedSubmitHandler({
      router: { navigate: (o: { href: string }) => { navigated = o.href; return Promise.resolve(); } } as never,
      write: (v) => posted.push(v),
    });
    const doc = new DOMParser().parseFromString(
      `<form method="post" action="/p/a/gates/g1"><input name="x" value="1"></form>` +
        `<form method="post" action="/p/a/chat/turns"><input name="m" value="hi"></form>` +
        `<form method="get" action="/p/a"><input name="sev" value="major"></form>`,
      "text/html",
    );
    const forms = [...doc.querySelectorAll("form")] as HTMLFormElement[];
    const mkEvent = (form: HTMLFormElement) =>
      ({
        target: form,
        defaultPrevented: false,
        nativeEvent: { submitter: null },
        preventDefault() {
          (this as { defaultPrevented: boolean }).defaultPrevented = true;
        },
      }) as unknown as Parameters<ReturnType<typeof delegatedSubmitHandler>>[0];
    // gate decide → JSON write claimed
    handler(mkEvent(forms[0]!));
    expect(posted.length).toBe(1);
    expect(posted[0]!.action).toBe("/p/a/gates/g1");
    expect(posted[0]!.json["x"]).toBe("1");
    // chat form → untouched (232's fetch mutation owns it)
    const chatEv = mkEvent(forms[1]!);
    handler(chatEv);
    expect(chatEv.defaultPrevented).toBe(false);
    expect(posted.length).toBe(1);
    // GET filter form → in-router nav
    handler(mkEvent(forms[2]!));
    expect(navigated).toBe("/p/a?sev=major");
  });
});

