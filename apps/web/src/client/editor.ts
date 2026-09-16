// The source-editor client bundle (PRB.07; REQ-BETA-21 stopgap #1 → 1.x Source mode). Upgrades the SSR'd
// read-only <textarea> to a CodeMirror markdown editor and runs the debounced autosave through the
// same-origin web routes (the web server forwards the session to the api — the bundle never sees a
// credential, and no protocol/eval text may reach it, REQ-ARCH-33). Also polls the doc endpoint for §6.3
// lock changes: a held lock read-onlys the editor + shows the banner; a released lock re-enables it. The
// findings rail is server-rendered (projections are findings-core's job); the bundle only surfaces lock +
// sync state. No Save button, no unsaved-changes dialog — a pagehide beacon flushes the pending doc.

import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { createSyncMachine, type SaveOutcome, type SyncState } from "./sync-machine";

const DEBOUNCE_MS = 800; // the documented exposure window for a mid-edit refresh (ticket AC)
const LOCK_POLL_MS = 10_000;

interface EditorDocResponse {
  draftId?: string;
  lock?: { runId: string; kind: "writer" | "reader"; workflow: string } | null;
  draftN?: number;
  findings?: { findingId: string; lost: boolean }[];
}

const pill = document.querySelector<HTMLElement>("[data-sync-pill]");
const banner = document.querySelector<HTMLElement>("[data-editor-banner]");
const bannerText = banner?.querySelector<HTMLElement>("[data-editor-banner-text]");

function setPill(state: SyncState): void {
  if (!pill) return;
  const label =
    state === "synced"
      ? pill.dataset["labelSynced"]
      : state === "syncing"
        ? pill.dataset["labelSyncing"]
        : state === "locked"
          ? pill.dataset["labelLocked"] ?? pill.dataset["labelQueued"]
          : pill.dataset["labelQueued"];
  pill.textContent = label ?? state;
  pill.dataset["syncState"] = state;
}

function setBanner(lock: { kind: "writer" | "reader"; workflow: string } | null): void {
  if (!banner) return;
  banner.hidden = lock == null;
  // the SSR'd inline display wins over the [hidden] UA rule, so manage it explicitly in both directions
  banner.style.display = lock == null ? "none" : "flex";
  // the SSR'd copy templates carry a {workflow} placeholder — the copy table stays in the app, the bundle
  // only substitutes the token.
  const template =
    lock == null ? "" : (banner.dataset[lock.kind === "writer" ? "writerText" : "readerText"] ?? "");
  if (bannerText) bannerText.textContent = template.replace("{workflow}", lock?.workflow ?? "");
}

async function main(): Promise<void> {
  const root = document.querySelector<HTMLElement>("[data-editor-root]");
  const source = document.querySelector<HTMLTextAreaElement>("[data-editor-source]");
  const host = document.querySelector<HTMLElement>("[data-editor-host]");
  if (!root || !source || !host) return;

  let saveUrl = root.dataset["saveUrl"] ?? "";
  let docUrl = root.dataset["docUrl"] ?? "";
  let draftId = root.dataset["draftId"] ?? "";
  if (!saveUrl || !docUrl || !draftId) return;

  // The first autosave against a FROZEN head forks v(N+1) server-side and returns the new draft id —
  // rebase every subsequent request (autosave, pagehide beacon, lock poll) onto the forked head, and
  // rewrite the address bar so a refresh reloads the working copy instead of the frozen base. The doc
  // poll also rebases: a stale /edit/:frozenId load resolves to the child server-side and reports its id.
  const rebase = (newDraftId: string | undefined) => {
    if (!newDraftId || newDraftId === draftId) return;
    saveUrl = saveUrl.replace(`/edit/${draftId}/`, `/edit/${newDraftId}/`);
    docUrl = docUrl.replace(`/edit/${draftId}/`, `/edit/${newDraftId}/`);
    root.dataset["draftId"] = newDraftId;
    try {
      // window.history — the bare `history` identifier is CodeMirror's undo history import.
      window.history.replaceState(null, "", docUrl.replace(/\/doc$/, ""));
    } catch {
      /* a non-navigable context (tests) — the in-memory rebase still holds */
    }
    draftId = newDraftId;
  };

  let locked = root.dataset["locked"] === "1";
  const editable = new Compartment();
  const readOnly = new Compartment();

  const save = async (text: string): Promise<SaveOutcome> => {
    try {
      const res = await fetch(saveUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markdown: text }),
        credentials: "same-origin",
      });
      if (res.status === 409) return "locked";
      if (!res.ok) return "error";
      const body = (await res.json().catch(() => null)) as { draftId?: string } | null;
      rebase(body?.draftId);
      return "ok";
    } catch {
      return "error";
    }
  };

  const machine = createSyncMachine({
    debounceMs: DEBOUNCE_MS,
    save,
    onState: setPill,
  });

  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: source.value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        editable.of(EditorView.editable.of(!locked)),
        readOnly.of(EditorState.readOnly.of(locked)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) machine.changed(u.state.doc.toString());
        }),
        EditorView.theme({
          "&": { backgroundColor: "transparent", fontSize: "13px" },
          ".cm-content": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", padding: "14px 0" },
          ".cm-gutters": { backgroundColor: "transparent", border: "none" },
          "&.cm-focused": { outline: "none" },
        }),
      ],
    }),
  });
  const applyLock = (isLocked: boolean) => {
    locked = isLocked;
    root.dataset["locked"] = isLocked ? "1" : "0";
    view.dispatch({
      effects: [
        editable.reconfigure(EditorView.editable.of(!isLocked)),
        readOnly.reconfigure(EditorState.readOnly.of(isLocked)),
      ],
    });
    if (!isLocked) machine.unlock();
  };

  source.style.display = "none"; // the textarea was the no-JS fallback

  // Offline recovery: retry the queued save when the browser comes back; the pill reads offline-queued.
  window.addEventListener("online", () => machine.retry());

  // §6.3 lock poll — picks up a run grabbing or releasing the draft while the page sits open.
  const poll = async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch(docUrl, { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!res.ok) return;
      const doc = (await res.json()) as EditorDocResponse;
      rebase(doc.draftId);
      const nowLocked = doc.lock != null;
      setBanner(doc.lock ?? null);
      if (nowLocked !== locked) applyLock(nowLocked);
      syncRail(doc.findings);
    } catch {
      /* offline — the queued pill state already tells the story */
    }
  };
  // The findings rail is SSR'd; the poll refreshes each row's lost-anchor badge in place so the
  // "passage changed — still applies?" state tracks the saved head without a reload.
  const syncRail = (findings: { findingId: string; lost: boolean }[] | undefined) => {
    if (!findings) return;
    const rail = document.querySelector<HTMLElement>("[data-findings-rail]");
    const lostText = rail?.dataset["lostNoteText"] ?? "";
    for (const f of findings) {
      const row = document.querySelector<HTMLElement>(`[data-finding-id="${f.findingId}"]`);
      if (!row) continue;
      if (f.lost) row.setAttribute("data-lost", "true");
      else row.removeAttribute("data-lost");
      let note = row.querySelector<HTMLElement>("[data-lost-note]");
      if (f.lost && !note) {
        note = document.createElement("div");
        note.setAttribute("data-lost-note", "true");
        note.style.fontSize = "12px";
        note.style.marginTop = "4px";
        note.style.color = "var(--sev-major)";
        note.textContent = lostText;
        row.appendChild(note);
      } else if (!f.lost && note) {
        note.remove();
      }
    }
  };

  const pollTimer = window.setInterval(() => void poll(), LOCK_POLL_MS);
  document.addEventListener("visibilitychange", () => void poll());

  // REQ-IDE-43's spirit at beta fidelity: no unsaved-changes dialog — instead a best-effort beacon flushes
  // the pending doc through the same save route (text/plain) so a refresh loses at most the debounce window.
  window.addEventListener("pagehide", () => {
    const pending = machine.pendingFlush();
    if (pending != null && navigator.sendBeacon) {
      navigator.sendBeacon(saveUrl, new Blob([pending], { type: "text/plain" }));
    }
  });
  window.addEventListener("beforeunload", () => machine.dispose());
  window.addEventListener("unload", () => window.clearInterval(pollTimer));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void main());
} else {
  void main();
}
