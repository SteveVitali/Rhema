// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorView } from "@codemirror/view";

// The client bundle's DOM/CodeMirror wiring (PRB.07): mounts over the SSR'd textarea, hides the fallback,
// runs the debounced autosave through the same-origin save route, flips to read-only + banner on a 409
// lock, and polls the doc endpoint for lock changes. happy-dom supplies the DOM; fetch is stubbed — the
// save payload itself is asserted.

const MARKUP = `
<section data-editor-root="true" data-draft-id="d_1" data-save-url="/p/s/edit/d_1/save" data-doc-url="/p/s/edit/d_1/doc" data-locked="0">
  <span data-sync-pill="true" data-sync-state="synced"
        data-label-synced="Synced" data-label-syncing="Syncing…"
        data-label-queued="Offline — queued" data-label-locked="Locked">Synced</span>
  <div data-editor-banner="true" hidden
       data-writer-text="A {workflow} run is writing this draft"
       data-reader-text="A {workflow} run is reading this draft">
    <span data-editor-banner-text="true"></span>
  </div>
  <div data-editor-host="true">
    <textarea data-editor-source="true" readonly># Title

A paragraph.
</textarea>
  </div>
  <aside data-findings-rail="true" data-lost-note-text="passage changed — still applies?">
    <ul>
      <li data-finding-id="f_1"><div>The quote drifted.</div></li>
    </ul>
  </aside>
</section>`;

function docResponse(
  lock: { runId: string; kind: "writer" | "reader"; workflow: string } | null = null,
  findings: { findingId: string; lost: boolean }[] = [{ findingId: "f_1", lost: false }],
) {
  return new Response(
    JSON.stringify({ draftId: "d_1", draftN: 1, lock, findings }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function boot() {
  document.body.innerHTML = MARKUP;
  vi.resetModules();
  await import("./editor.ts");
  // the module boots on DOMContentLoaded/readyState — happy-dom may need a tick
  await vi.advanceTimersByTimeAsync(0);
}

const view = () => {
  const host = document.querySelector("[data-editor-host]")!;
  const cm = host.querySelector(".cm-content");
  expect(cm, "CodeMirror mounted").toBeTruthy();
  return EditorView.findFromDOM(host as HTMLElement)!;
};

const pill = () => document.querySelector<HTMLElement>("[data-sync-pill]")!;

describe("editor client bundle (PRB.07)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("mounts CodeMirror over the host and hides the no-JS textarea fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => docResponse()));
    await boot();
    expect(document.querySelector("[data-editor-host] .cm-editor")).toBeTruthy();
    expect((document.querySelector<HTMLTextAreaElement>("[data-editor-source]")!).style.display).toBe("none");
    expect(view().state.doc.toString()).toBe("# Title\n\nA paragraph.\n");
    expect(view().state.readOnly).toBe(false);
  });

  it("debounces an edit into a save POST with the full markdown; the pill returns to synced", async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: String(init?.body ?? "") });
        return new Response(JSON.stringify({ draftId: "d_1", draftN: 1, sync: "synced" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    await boot();
    view().dispatch({ changes: { from: 0, insert: "!" } });
    expect(pill().dataset["syncState"]).toBe("syncing");
    await vi.advanceTimersByTimeAsync(900); // past the 800ms debounce
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/p/s/edit/d_1/save");
    expect(JSON.parse(calls[0]!.body).markdown).toBe("!# Title\n\nA paragraph.\n");
    expect(pill().dataset["syncState"]).toBe("synced");
  });

  it("a forked save rebases the client: the next save + beacon + poll target the new draft id", async () => {
    const calls: string[] = [];
    let forked = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        calls.push(String(url));
        if (String(url).endsWith("/save")) {
          // the first save forks server-side; the response carries the CHILD's id
          forked = true;
          return new Response(JSON.stringify({ draftId: "d_2", draftN: 2, forked: true, sync: "synced" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ draftId: forked ? "d_2" : "d_1", draftN: 2, lock: null, findings: [] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    await boot();
    view().dispatch({ changes: { from: 0, insert: "!" } });
    await vi.advanceTimersByTimeAsync(900);
    expect(calls[0]).toBe("/p/s/edit/d_1/save");
    expect(document.querySelector<HTMLElement>("[data-editor-root]")!.dataset["draftId"]).toBe("d_2");

    view().dispatch({ changes: { from: 0, insert: "?" } });
    await vi.advanceTimersByTimeAsync(900);
    expect(calls[1]).toBe("/p/s/edit/d_2/save");

    // the lock poll + pagehide beacon re-target too.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls[2]).toBe("/p/s/edit/d_2/doc");
  });

  it("a doc poll that resolves to a different draft id rebases the client (stale base URL)", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        calls.push(String(url));
        return new Response(
          JSON.stringify({ draftId: "d_2", draftN: 2, lock: null, findings: [] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    await boot();
    await vi.advanceTimersByTimeAsync(10_000); // the poll reports the working child
    expect(document.querySelector<HTMLElement>("[data-editor-root]")!.dataset["draftId"]).toBe("d_2");

    view().dispatch({ changes: { from: 0, insert: "!" } });
    await vi.advanceTimersByTimeAsync(900);
    expect(calls.some((u) => u === "/p/s/edit/d_2/save")).toBe(true);
  });

  it("a 409 save read-onlys the editor and surfaces the lock on the pill", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "locked" }), { status: 409 })),
    );
    await boot();
    view().dispatch({ changes: { from: 0, insert: "x" } });
    await vi.advanceTimersByTimeAsync(900);
    expect(pill().dataset["syncState"]).toBe("locked");
  });

  it("the doc poll locks the editor + banner when a run appears, and releases on clear", async () => {
    let lock: { runId: string; kind: "writer" | "reader"; workflow: string } | null = null;
    vi.stubGlobal("fetch", vi.fn(async () => docResponse(lock)));
    await boot();
    lock = { runId: "run_7", kind: "writer", workflow: "revise" };
    await vi.advanceTimersByTimeAsync(10_000); // the poll tick
    expect(view().state.readOnly).toBe(true);
    const banner = document.querySelector<HTMLElement>("[data-editor-banner]")!;
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain("A revise run is writing this draft");
    expect(document.querySelector<HTMLElement>("[data-editor-root]")!.dataset["locked"]).toBe("1");

    lock = null;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(view().state.readOnly).toBe(false);
    expect(banner.hidden).toBe(true);
  });

  it("the doc poll refreshes a finding's lost-anchor badge in place (no reload)", async () => {
    let findings = [{ findingId: "f_1", lost: false }];
    vi.stubGlobal("fetch", vi.fn(async () => docResponse(null, findings)));
    await boot();
    const row = document.querySelector<HTMLElement>('[data-finding-id="f_1"]')!;
    expect(row.getAttribute("data-lost")).toBeNull();

    findings = [{ findingId: "f_1", lost: true }];
    await vi.advanceTimersByTimeAsync(10_000);
    expect(row.getAttribute("data-lost")).toBe("true");
    expect(row.textContent).toContain("passage changed — still applies?");

    findings = [{ findingId: "f_1", lost: false }];
    await vi.advanceTimersByTimeAsync(10_000);
    expect(row.getAttribute("data-lost")).toBeNull();
    expect(row.textContent).not.toContain("passage changed");
  });
});
