// The Page client island (P1.02; §5.4; REQ-DATA-28/29 amended, REQ-POS-8/9, REQ-PROD-14). Mounts the
// schema-first ProseMirror view over the SSR'd doc JSON (the SSR preview stays as the no-JS read view
// and is replaced on mount), then drives the SAME persistence contract the beta editor established:
// debounced autosave through the same-origin web routes (EditorTransport — P1.03 swaps the transport,
// not the editor), a 10-s §6.3 lock poll that read-onlys the view, the findings/provenance/Authorship
// sidecar decorations, proposal-card accept/reject (agent-origin, undo-excluded transactions), live
// status-bar meters, and the pagehide beacon flush. The bundle never sees a credential and must never
// carry protocol/eval text (REQ-ARCH-33).

import { EditorView } from "prosemirror-view";
import {
  createPageState,
  docToMarkdown,
  setDecorationInputs,
  provenanceKey,
  provenanceForSave,
  authorshipClasses,
  statusMeters,
  acceptProposalTr,
  ORIGIN_META,
  type BlockSource,
  type EditOrigin,
  type FindingForDecoration,
  type Proposal,
} from "@rhema/editor";
import { createSyncMachine, type SaveOutcome, type SyncState } from "./sync-machine";

const DEBOUNCE_MS = 800; // the documented exposure window for a mid-edit refresh
const LOCK_POLL_MS = 10_000;

interface PageDocResponse {
  draftId?: string;
  draftN?: number;
  state?: string;
  lock?: { runId: string; kind: "writer" | "reader"; workflow: string } | null;
  findings?: { findingId: string; severity: string; anchor: unknown; lost: boolean }[];
  provenance?: Record<string, unknown> | null;
  venueCap?: string | null;
}

function readJson<T>(sel: string, fallback: T): T {
  const el = document.querySelector<HTMLScriptElement>(sel);
  if (!el?.textContent) return fallback;
  try {
    return JSON.parse(el.textContent) as T;
  } catch {
    return fallback;
  }
}

const pill = document.querySelector<HTMLElement>("[data-sync-pill]");
const lockBanner = document.querySelector<HTMLElement>('[data-page-banner="lock"]');
const lockBannerText = lockBanner?.querySelector<HTMLElement>("[data-page-banner-text]");

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

function setLockBanner(lock: { kind: "writer" | "reader"; workflow: string } | null): void {
  if (!lockBanner) return;
  lockBanner.style.display = lock == null ? "none" : "flex";
  const template =
    lock == null ? "" : (lockBanner.dataset[lock.kind === "writer" ? "writerText" : "readerText"] ?? "");
  if (lockBannerText) lockBannerText.textContent = template.replace("{workflow}", lock?.workflow ?? "");
}

/** A provenance row from `provenance_maps` → the plugin's BlockSource (shape-preserving, kind-guarded). */
function toBlockSource(v: unknown): BlockSource {
  const kind = (v as { kind?: string } | null)?.kind;
  switch (kind) {
    case "agent":
    case "chat":
    case "suggestion_applied":
    case "mixed":
    case "human_mobile":
    case "pasted":
      return v as BlockSource;
    default:
      return { kind: "human" };
  }
}

async function main(): Promise<void> {
  const root = document.querySelector<HTMLElement>("[data-page-root]");
  const host = root?.querySelector<HTMLElement>("[data-page-host]");
  const preview = host?.querySelector<HTMLElement>("[data-page-preview]");
  if (!root || !host) return;

  let saveUrl = root.dataset["saveUrl"] ?? "";
  let docUrl = root.dataset["docUrl"] ?? "";
  let draftId = root.dataset["draftId"] ?? "";
  if (!saveUrl || !docUrl || !draftId) return;

  const docJson = readJson<unknown>("script[data-page-doc]", null);
  const provMap = readJson<Record<string, unknown>>("script[data-page-prov]", {});
  const findings = readJson<FindingForDecoration[]>("script[data-page-findings]", []);
  if (docJson == null) return;

  // The first autosave against a FROZEN head forks v(N+1) server-side and returns the new draft id —
  // rebase every subsequent request onto the forked head (the same contract the beta editor had).
  const rebase = (newDraftId: string | undefined) => {
    if (!newDraftId || newDraftId === draftId) return;
    saveUrl = saveUrl.replace(`/${draftId}/`, `/${newDraftId}/`);
    docUrl = docUrl.replace(`/${draftId}/`, `/${newDraftId}/`);
    root.dataset["draftId"] = newDraftId;
    draftId = newDraftId;
  };

  let locked = root.dataset["locked"] === "1";
  const readonly = root.dataset["readonly"] === "1";

  // ---- the view -------------------------------------------------------------
  const initSources = new Map<string, BlockSource>();
  for (const [blockId, src] of Object.entries(provMap)) initSources.set(blockId, toBlockSource(src));

  const view = new EditorView(host, {
    state: createPageState(docJson, initSources),
    editable: () => !locked && !readonly,
  });
  preview?.remove(); // the SSR read view yields to the live PM surface
  view.dom.classList.add("rm-page");
  view.dom.setAttribute("data-page-view", "1");

  // Provenance origins (REQ-POS-8): a paste arms a one-shot flag so the paste transaction is stamped
  // `pasted`; every other doc-changing tr without an explicit origin is `human`. Agent-origin trs
  // (proposal accepts) carry their own ORIGIN_META and pass through untouched.
  let pasteArmed = false;
  view.dom.addEventListener("paste", () => {
    pasteArmed = true;
    setTimeout(() => (pasteArmed = false), 0);
  });

  // ---- decorations: findings spans + Authorship overlay ----------------------
  const refreshDecorations = () => {
    const prov = provenanceKey.getState(view.state);
    const on = document.querySelector<HTMLElement>("[data-ide]")?.dataset["authorship"] === "1";
    setDecorationInputs(view, {
      findings,
      authorship: on && prov ? authorshipClasses(prov) : null,
    });
  };
  window.addEventListener("rhema:authorship", () => refreshDecorations());
  refreshDecorations();

  // ---- proposal cards --------------------------------------------------------
  for (const card of root.querySelectorAll<HTMLElement>("[data-proposal-card]")) {
    const proposal: Proposal = {
      id: card.dataset["proposalCard"] ?? "",
      kind: (card.dataset["proposalKind"] as "replace" | "insert") ?? "replace",
      from: Number(card.dataset["proposalFrom"] ?? 0),
      to: Number(card.dataset["proposalTo"] ?? 0),
      markdown: card.dataset["proposalMd"] ?? "",
      origin: (card.dataset["proposalOrigin"] ?? "agent:assistant:run_unknown") as EditOrigin,
    };
    card.querySelector<HTMLElement>("[data-proposal-accept]")?.addEventListener("click", () => {
      // one agent-origin tr, excluded from the human undo stack (⌘Z never reaches it)
      view.dispatch(acceptProposalTr(view.state.doc, view.state.tr, proposal));
      card.remove();
    });
    card.querySelector<HTMLElement>("[data-proposal-reject]")?.addEventListener("click", () => {
      card.remove(); // reject is a document no-op
    });
  }

  // ---- status meters (per-keystroke, into the P1.01 status bar slots) --------
  const wordsEl = document.querySelector<HTMLElement>("[data-status-words]");
  const readMinEl = document.querySelector<HTMLElement>("[data-status-readmin]");
  const updateMeters = () => {
    const m = statusMeters(view.state.doc);
    if (wordsEl) wordsEl.textContent = (wordsEl.dataset["fmt"] ?? "{n}").replace("{n}", String(m.words));
    if (readMinEl) readMinEl.textContent = (readMinEl.dataset["fmt"] ?? "{n}").replace("{n}", String(m.readMin));
  };
  updateMeters();

  // ---- autosave through the transport seam -----------------------------------
  const save = async (markdown: string): Promise<SaveOutcome> => {
    try {
      const prov = provenanceForSave(view.state);
      const agentSpans = provenanceKey.getState(view.state)?.agentSpans ?? [];
      const res = await fetch(saveUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          markdown,
          provenanceSpans: prov,
          agentSpans: agentSpans.map((s) => ({ blockId: "", from: s.from, to: s.to })),
        }),
        credentials: "same-origin",
      });
      if (res.status === 409) return "locked";
      if (!res.ok) return "error";
      const body = (await res.json().catch(() => null)) as { draftId?: string; forked?: boolean } | null;
      rebase(body?.draftId);
      return "ok";
    } catch {
      return "error";
    }
  };

  const machine = createSyncMachine({ debounceMs: DEBOUNCE_MS, save, onState: setPill });

  const origDispatch = view.dispatch.bind(view);
  view.setProps({
    dispatchTransaction(tr) {
      if (tr.docChanged && tr.getMeta(ORIGIN_META) == null) {
        tr.setMeta(ORIGIN_META, pasteArmed ? "pasted" : "human");
      }
      origDispatch(tr);
      if (tr.docChanged) {
        machine.changed(docToMarkdown(view.state.doc));
        updateMeters();
      }
    },
  });

  const applyLock = (isLocked: boolean) => {
    locked = isLocked;
    root.dataset["locked"] = isLocked ? "1" : "0";
    view.dispatch(view.state.tr); // re-reads `editable` + remaps decorations
    if (!isLocked) machine.unlock();
  };

  // Offline recovery: retry the queued save when the browser comes back.
  window.addEventListener("online", () => machine.retry());

  // §6.3 lock poll — a run grabbing/releasing the draft while the page sits open.
  const poll = async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch(docUrl, { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!res.ok) return;
      const doc = (await res.json()) as PageDocResponse;
      rebase(doc.draftId);
      const nowLocked = doc.lock != null;
      setLockBanner(doc.lock ?? null);
      if (nowLocked !== locked) applyLock(nowLocked);
      syncRail(doc.findings);
      const venueEl = document.querySelector<HTMLElement>("[data-status-venue]");
      if (venueEl && doc.venueCap != null) venueEl.textContent = doc.venueCap;
    } catch {
      /* offline — the queued pill state already tells the story */
    }
  };
  // the SSR'd rail's lost-badge refresh (same contract as the beta editor's rail sync)
  const syncRail = (fs: { findingId: string; lost: boolean }[] | undefined) => {
    if (!fs) return;
    const rail = document.querySelector<HTMLElement>("[data-findings-rail]");
    const lostText = rail?.dataset["lostNoteText"] ?? "";
    for (const f of fs) {
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
    // keep the decoration inputs' lost flags in step
    for (const f of fs) {
      const d = findings.find((x) => x.findingId === f.findingId);
      if (d) (d as { lost: boolean }).lost = f.lost;
    }
    refreshDecorations();
  };

  const pollTimer = window.setInterval(() => void poll(), LOCK_POLL_MS);
  document.addEventListener("visibilitychange", () => void poll());

  // a deep-linked finding (/f/:id → the Page) scrolls to its card
  const focusId = root.dataset["focusFinding"];
  if (focusId) {
    document.querySelector<HTMLElement>(`[data-finding-id="${focusId}"]`)?.scrollIntoView({ block: "center" });
  }

  // no Save button, no unsaved-changes dialog — the pagehide beacon flushes the pending doc.
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
