// The Page client island (P1.03; §5.4/§5.10; REQ-DATA-28/29 amended, REQ-POS-8/9, REQ-PROD-14,
// REQ-IDE-43/45/46). Mounts the schema-first ProseMirror view over the collab session's shared
// fragment (the SSR preview stays as the no-JS read view and is replaced on mount), then drives the
// four-layer autosave: keystrokes enter the bound Y.Doc → y-indexeddb (offline survival) → the
// Hocuspocus socket to apps/collab → the server's debounced materialization into canonical markdown.
//
// There is NO markdown POST, NO sendBeacon, and NO beforeunload prompt — a pagehide sends the `blur`
// restore trigger + the provider's own flush, and y-indexeddb already holds every offline change.
// ⌘S mints a named restore point (the ONLY manual save verb). The §6.3 lock poll + findings rail +
// note/cancel forms keep their same-origin HTTP routes — the transport swap covers persistence only.
// The bundle never sees a credential and must never carry protocol/eval text (REQ-ARCH-33).

import { EditorView } from "prosemirror-view";
import {
  createCollabPageState,
  createPageState,
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
import { createCollabSession, type CollabSyncEvent } from "./collab";

const LOCK_POLL_MS = 10_000;
const PROV_FLUSH_MS = 600; // the provenance capture's piggyback cadence onto the stateless channel

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
const versionBanner = document.querySelector<HTMLElement>('[data-page-banner="version"]');
const versionBannerText = versionBanner?.querySelector<HTMLElement>("span");

let lockedOverride = false; // the poll's §6.3 read — beats the session's optimistic pill

function setPill(ev: CollabSyncEvent): void {
  if (!pill) return;
  const state = lockedOverride ? "readonly" : ev.state;
  const label =
    state === "synced"
      ? pill.dataset["labelSynced"]
      : state === "syncing"
        ? pill.dataset["labelSyncing"]
        : state === "readonly"
          ? pill.dataset["labelReadonly"] ?? pill.dataset["labelLocked"]
          : (pill.dataset["labelOffline"] ?? pill.dataset["labelQueued"] ?? "").replace(
              "{n}",
              String(ev.queued),
            );
  pill.textContent = label || state;
  pill.dataset["syncState"] = state;
}

function setLockBanner(lock: { kind: "writer" | "reader"; workflow: string } | null): void {
  if (!lockBanner) return;
  lockBanner.style.display = lock == null ? "none" : "flex";
  const template =
    lock == null ? "" : (lockBanner.dataset[lock.kind === "writer" ? "writerText" : "readerText"] ?? "");
  if (lockBannerText) lockBannerText.textContent = template.replace("{workflow}", lock?.workflow ?? "");
}

/** After a frozen_head fork the version banner reads §5.4's "Editing vN · findings from vM follow your text". */
function showForkBanner(root: HTMLElement, draftN: number, baseN: number): void {
  if (!versionBanner || !versionBannerText) return;
  const fmt = root.dataset["forkFmt"] ?? "Editing v{n} · findings from v{base} follow your text";
  versionBannerText.textContent = fmt.replace("{n}", String(draftN)).replace("{base}", String(baseN));
  versionBanner.style.display = "flex";
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

/** Provenance origins (REQ-POS-8): stamp every doc-changing transaction that carries no explicit
 *  ORIGIN_META with "pasted" (armed by the one-shot paste flag) or "human". Exported for the
 *  happy-dom regression test — EDIT.1: this hook must apply the tr directly; `view.dispatch`
 *  inside dispatchTransaction routes back through the hook and blew the stack on the first
 *  keystroke (the N8 prod walk caught it — latent while the embed bug kept the island dead). */
export function installOriginDispatch(
  view: EditorView,
  opts: { readonly armed: () => boolean; readonly onDocChanged: () => void },
): void {
  view.setProps({
    dispatchTransaction(tr) {
      if (tr.docChanged && tr.getMeta(ORIGIN_META) == null) {
        tr.setMeta(ORIGIN_META, opts.armed() ? "pasted" : "human");
      }
      view.updateState(view.state.apply(tr));
      if (tr.docChanged) opts.onDocChanged();
    },
  });
}

async function main(): Promise<void> {
  const root = document.querySelector<HTMLElement>("[data-page-root]");
  const host = root?.querySelector<HTMLElement>("[data-page-host]");
  const preview = host?.querySelector<HTMLElement>("[data-page-preview]");
  if (!root || !host) return;

  const collabUrl = root.dataset["collabUrl"] ?? "";
  let docUrl = root.dataset["docUrl"] ?? "";
  let draftId = root.dataset["draftId"] ?? "";
  let draftN = Number(root.dataset["draftN"] ?? 0);
  if (!docUrl || !draftId) return;

  const docJson = readJson<unknown>("script[data-page-doc]", null);
  const provMap = readJson<Record<string, unknown>>("script[data-page-prov]", {});
  const findings = readJson<FindingForDecoration[]>("script[data-page-findings]", []);
  if (docJson == null) return;

  let locked = root.dataset["locked"] === "1";
  const readonly = root.dataset["readonly"] === "1" && !collabUrl;

  // ---- the collab session (the four-layer autosave) -----------------------------
  // Frozen heads connect with write intent — the server's auth performs the REQ-IDE-46 fork and
  // refuses with the child's id; `rebind` points the SAME Y.Doc (offline updates intact) at it.
  const session = collabUrl
    ? createCollabSession({
        wsUrl: collabUrl,
        draftId,
        onSync: (ev) => setPill(ev),
        onFork: (fork) => {
          const baseN = draftN;
          rebase(fork.draftId); // rebase owns the session rebind (URL + dataset + provider)
          draftN = fork.draftN;
          showForkBanner(root, fork.draftN, baseN);
        },
        onReadOnly: () => {
          // the server attached us read-only (a run lock or a non-editable head) — no local edits
          locked = true;
          root.dataset["locked"] = "1";
          view.dispatch(view.state.tr);
        },
        onRestorePoint: () => setPill({ state: "synced", queued: 0 }),
      })
    : null;

  // The rebase every head-switch shares (the fork's auth refusal AND the doc poll both route here).
  const rebase = (newDraftId: string | undefined) => {
    if (!newDraftId || newDraftId === draftId) return;
    docUrl = docUrl.replace(`/${draftId}/`, `/${newDraftId}/`);
    root.dataset["draftId"] = newDraftId;
    draftId = newDraftId;
    session?.rebind(newDraftId);
  };

  // ---- the view -------------------------------------------------------------
  const initSources = new Map<string, BlockSource>();
  for (const [blockId, src] of Object.entries(provMap)) initSources.set(blockId, toBlockSource(src));

  const view = new EditorView(host, {
    state: session
      ? createCollabPageState(session.fragment, initSources)
      : createPageState(docJson, initSources),
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

  // ---- keystrokes → the Y.Doc (the ySyncPlugin persists them) ----------------
  // The live provenance capture piggybacks the stateless channel so the server's next
  // materialization writes the block-level map (REQ-DATA-29's capture half over the CRDT).
  let provTimer: number | null = null;
  const flushProvenance = () => {
    provTimer = null;
    const agentSpans = provenanceKey.getState(view.state)?.agentSpans ?? [];
    session?.sendProvenance({
      spans: provenanceForSave(view.state),
      agentSpans: agentSpans.map((s) => ({ blockId: "", from: s.from, to: s.to })),
    });
  };

  installOriginDispatch(view, {
    armed: () => pasteArmed,
    onDocChanged: () => {
      updateMeters();
      if (provTimer == null) provTimer = window.setTimeout(flushProvenance, PROV_FLUSH_MS);
    },
  });

  // ⌘S — the named restore point (the ONLY manual save verb; never a Save button).
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      session?.markRestorePoint();
      setPill({ state: "syncing", queued: session?.provider.unsyncedChanges ?? 0 });
    }
  });

  const applyLock = (isLocked: boolean) => {
    locked = isLocked;
    lockedOverride = isLocked;
    root.dataset["locked"] = isLocked ? "1" : "0";
    view.dispatch(view.state.tr); // re-reads `editable` + remaps decorations
    if (session) setPill(session.sync);
  };
  lockedOverride = locked;
  if (session) setPill(session.sync);

  // §6.3 lock poll — a run grabbing/releasing the draft while the page sits open (unchanged route).
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
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") session?.flushOnHide();
    else void poll();
  });

  // a deep-linked finding (/f/:id → the Page) scrolls to its card
  const focusId = root.dataset["focusFinding"];
  if (focusId) {
    document.querySelector<HTMLElement>(`[data-finding-id="${focusId}"]`)?.scrollIntoView({ block: "center" });
  }

  // No Save button, no unsaved-changes dialog, NO beforeunload — pagehide flushes the `blur`
  // restore point + the provider's pending updates; y-indexeddb holds whatever never left.
  window.addEventListener("pagehide", () => {
    if (provTimer != null) flushProvenance();
    session?.flushOnHide();
    window.clearInterval(pollTimer);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void main());
} else {
  void main();
}
