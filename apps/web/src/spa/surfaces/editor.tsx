// SPA.23 — the `editor` surface's five leaves (design/23 §3/§7; design/25 `p.index`/`p.page`/
// `p.compare`/`p.artifact`/`p.revision`; REQ-ED-1..17, REQ-BFF-1/2/9/11/22, REQ-NAV-6, REQ-UX-16).
//
//   • The bodies are the SSR trees verbatim: `ProjectOverviewBody`/`PageChrome` (page-chrome.tsx,
//     the shared module the document's `ProjectPage`/`PageSurface` delegate to) plus
//     `WhatChangedView`/`CompareView` with the same label bags — the dom-contract's editor
//     vocabulary is attribute-for-attribute identical across renderers.
//   • THE MOUNT — `PageMount` replaces the `data-page-host` block through `PageEditor`'s `host`
//     seam: the hand-rolled `useRef`+`useEffect` ProseMirror binding over the session registry's
//     `EditorState` (REQ-ED-1/4/14 — `markdownToDoc(markdown).toJSON()` derives `docJson`
//     leaf-side; the `script[type=json]` embeds + `/assets/page.js` tag are `embeds={false}`-dropped
//     as SSR artifacts). `viewRef` hands the live view to the proposal accepts.
//   • THE WRITES — the delegated submit re-issues this surface's same-origin POSTs as JSON
//     (design/22 §3 — the DOM contract is the wire contract): the note/cancel-run/revise trio,
//     the restore-point apply, the hunk comments, and the overview's own rows (rename /
//     approval-overrides opt-in / voice pick + hatches / gate dispositions / decision answers).
//     Every path carries a `wantsJson` branch server-side; anything else stays a native form
//     post (the document nav still answers it).
//   • URL state is never payload: `?noted`/`?restored`/`?hc`/`?rename`/`?created`/`?derror`/
//     `?voice_locked`/`?layout`/`?commented` merge leaf-side from the leaf's own search — the
//     twin keys carry only the server-owned `?restore`/`?focus`.
//   • THE SESSION — SPA.24 bound the collab wire: when the twin carries a server-authorized
//     `collabWsUrl`, `PageMount`'s registry init builds the `CollabPageWire` (Y.Doc →
//     y-indexeddb → cookie-auth Hocuspocus → server materialization) and owns the island's
//     chrome legs — the live sync pill, the 10 s visible-only lock poll, ⌘S restore points,
//     pagehide/visibility flushes, the frozen-fork `rhema.fork` → `registry.rekey` rebase.

import { useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import type { EditorView } from "prosemirror-view";
import { acceptProposalTr, markdownToDoc, type EditOrigin, type FindingForDecoration, type Proposal } from "@rhema/editor";
import { CompareView, ToastProvider, useToast, WhatChangedView } from "@rhema/ui";
import { COPY } from "../../copy.js";
import { rewriteDemoDocLinks } from "../../demo-markers.js";
import { deleteHold, getHold } from "../../client/hold-store.js";
import { chatPanelLive as chatPanel } from "../chat-live.js";
import { runCardLabels, timelineHrefs, timelineLabels } from "../../dossier-view.js";
import {
  PageChrome,
  ProjectOverviewBody,
  compareLabels,
  whatChangedLabels,
  type PageChromeBag,
} from "../../page-chrome.js";
import { BffError } from "../bff.js";
import { useDwell } from "../dwell.js";
import type { IdeChromeData, IdeTwinShell } from "../ide/chrome-data.js";
import { useShellChrome } from "../ide/chrome-data.js";
import type {
  BffArtifactTwin,
  BffCompareTwin,
  BffPageBag,
  BffProjectTwin,
  BffRevisionTwin,
  BffVersionPageTwin,
} from "../queries.js";
import { isDemo } from "../demo.js";
import { PageMount } from "../page-mount.js";
import { useReadOnlyProject, ReadOnlyNotice, readOnlyReasonText } from "../read-only.js";
import { TimelineGateCard } from "./dossier.js";
import { delegatedSubmitHandler, usePaneWrite } from "../write-paths.js";

/**
 * The editor surface's write grammar — every same-origin POST a control inside these leaves can
 * issue. Each has a `wantsJson` branch on the server (SPA.23); anything outside this grammar
 * keeps its native leg (the document nav still answers it — the dossier.tsx precedent).
 */
/**
 * R7RELOAD.1 (REQ-RELOAD-2) — the editor's write grammar is retired into the shared
 * `SPA_WRITE` allowlist (`../write-paths.js`). The leaf's own `onSubmit` claims its forms via
 * the ONE delegated handler; the IdeChrome host's identical handler covers the pane bodies.
 */

/** One editor-surface write — the shared mutation with the editor's stale-state error arm. */
function useEditorWrite() {
  const [mutError, setMutError] = useState<string | null>(null);
  const { pending, write } = usePaneWrite({
    onError: (err) => {
      // Stale-state writes (design/22 §3): a refused write — lock held/canceled/frozen (400/403/
      // 404/409) — is the SSR's silent re-render: `onSettled`'s invalidate re-reads the twin and
      // the post-decision page is the answer. Only a real fault lands the alert line.
      if (err instanceof BffError && [400, 403, 404, 409].includes(err.status)) return;
      setMutError(err instanceof BffError ? (err.detail ?? err.code) : COPY.spaError.body);
    },
  });
  return { pending, mutError, write };
}

// ---------------------------------------------------------------------------------------------------------------------
// The ONB.1 held-consumed handshake (`?hc=<token>`): the leaf renders the verbatim
// `data-held-consumed` marker and runs the same token-matched delete the `landing.js` island
// runs — the hold dies to a server-confirmed consumption, never to a page view.
// ---------------------------------------------------------------------------------------------------------------------

/** R7HOME.2a — the REQ-DATA-14 landing toast: `?imported=<outcome>&pn=<frozenN>` names which
 *  overwrite-rule arm ran (URL flash, like `?noted`/`?restored`). Pushed once on mount. */
function ImportToast({
  imported,
  pn,
}: {
  readonly imported: string | undefined;
  readonly pn: string | undefined;
}): ReactNode {
  const toast = useToast();
  useEffect(() => {
    if (!imported) return;
    if (imported === "overwrote") {
      toast.push({ title: COPY.import.toastImportedOverwrote, tone: "ok" });
    } else if (imported === "superseded") {
      toast.push({
        title: COPY.import.toastImportedSupersededFmt
          .replace("{n}", pn ? `v${Number(pn) + 1}` : "the new version")
          .replace("{m}", pn ? `v${pn}` : "the previous draft"),
        tone: "ok",
      });
    } else {
      toast.push({ title: COPY.import.toastImportedCreated, tone: "ok" });
    }
  }, [imported, pn, toast]);
  return null;
}

function HeldConsumedMarker({ token }: { readonly token: string }): ReactNode {
  useEffect(() => {
    void getHold().then((rec) => {
      if (rec && token === rec.token) return deleteHold();
      return undefined;
    });
  }, [token]);
  return <span data-held-consumed={token} hidden />;
}

// ---------------------------------------------------------------------------------------------------------------------
// The mount half — the `page` bag → the `host` ReactNode + the proposal seams.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * `BffPageBag` → the `PageData["page"]` shape `PageChrome` renders: `docJson` derives leaf-side
 * through the SAME canonical `markdownToDoc(...).toJSON()` the document's `page-data.ts` runs
 * (design/23 F5 + REQ-ED-14); the leaf-owned URL echoes (`?noted`, `?restored`) merge here.
 * `bag === undefined` returns undefined — the overview's missing-head arm stays mount-free.
 */
function usePageBag(
  bag: BffPageBag | undefined,
  merge?: { readonly noteSaved?: boolean; readonly restoredN?: number | null },
): PageChromeBag | undefined {
  const markdown = bag?.doc.markdown;
  const docJson = useMemo(
    // R7DEM.5 (REQ-TOUR-6 + REQ-DWEB-17) — the leaf-side docJson derivation rewrites corpus
    // refs: excluded artifacts lose their link mark ("not published" non-links) and published
    // `assetRefs` resolve to the demo asset route (never a relative-path 404).
    () => (markdown == null
      ? undefined
      : rewriteDemoDocLinks(markdownToDoc(markdown).toJSON(), bag?.doc.demo, isDemo())),
    [markdown, bag?.doc.demo],
  );
  const restoredN = merge?.restoredN;
  const noteSaved = merge?.noteSaved;
  return useMemo<PageChromeBag | undefined>(() => {
    if (!bag || docJson === undefined) return undefined;
    return {
      ...bag,
      docJson,
      ...(noteSaved ? { noteSaved: true } : {}),
      ...(bag.rail
        ? {
            rail: {
              ...bag.rail,
              ...(restoredN != null && Number.isFinite(restoredN) ? { restoredN } : {}),
            },
          }
        : {}),
    } as PageChromeBag;
  }, [bag, docJson, noteSaved, restoredN]);
}

/** The proposal cards' accept/reject seam — the island's click legs verbatim: accept dispatches
 *  ONE agent-origin tr through `acceptProposalTr` (excluded from the human undo stack); reject is
 *  a document no-op (the card drops). `dismissed` holds the dropped card ids. */
function useProposalSeams(viewRef: MutableRefObject<EditorView | null>): {
  readonly accept: (p: { readonly id: string; readonly kind: "replace" | "insert"; readonly from: number; readonly to: number; readonly markdown: string; readonly origin: string }) => void;
  readonly reject: (id: string) => void;
  readonly filter: (id: string) => boolean;
} {
  const [dismissedIds, setDismissedIds] = useState<readonly string[]>([]);
  const dismissed = useMemo(() => new Set(dismissedIds), [dismissedIds]);
  return {
    accept: (p) => {
      const view = viewRef.current;
      if (!view) return;
      const proposal: Proposal = {
        id: p.id,
        kind: p.kind,
        from: p.from,
        to: p.to,
        markdown: p.markdown,
        origin: p.origin as EditOrigin,
      };
      view.dispatch(acceptProposalTr(view.state.doc, view.state.tr, proposal));
      setDismissedIds((ids) => [...ids, p.id]);
    },
    reject: (id) => setDismissedIds((ids) => [...ids, id]),
    filter: (id) => !dismissed.has(id),
  };
}

/** The `findings` input the mount's decoration layer reads — the embed's verbatim shape
 *  (`data-page-findings` on SSR, a prop here). */
function findingsForDecoration(page: PageChromeBag): FindingForDecoration[] {
  return page.doc.findings.map((f) => ({
    findingId: f.findingId,
    severity: f.severity,
    anchor: f.anchor ?? null,
    lost: f.lost,
    kind: f.kind,
    suggestion: f.suggestion,
  })) as unknown as FindingForDecoration[];
}

/** The `data-page-host` block's SPA owner — `PageEditor`'s `host` seam renders this; the pending
 *  `<PmPreview>` inside it IS the `data-page-preview` paint (REQ-ED-14's no-JS floor twin). */
function PageHost(props: {
  readonly page: PageChromeBag;
  readonly compact?: boolean;
  readonly viewRef: MutableRefObject<EditorView | null>;
}): ReactNode {
  const { page } = props;
  const slug = page.slug;
  const previewCtx = useMemo(
    () => ({
      figureHrefFor: (figureId: string) => `/p/${slug}/figures/${figureId}`,
      editFigureLabel: COPY.figureCard.editFigureLabel,
    }),
    [slug],
  );
  const findings = useMemo(() => findingsForDecoration(page), [page]);
  return (
    <PageMount
      draftId={page.doc.draftId}
      docJson={page.docJson}
      provenance={page.doc.provenance ?? null}
      findings={findings}
      locked={page.doc.lock != null}
      readOnly={page.readOnly === true || props.compact === true}
      collabUrl={page.collabWsUrl ?? ""}
      {...(page.focusFindingId ? { focusFindingId: page.focusFindingId } : {})}
      previewCtx={previewCtx}
      viewRef={props.viewRef}
    />
  );
}

/** The `page` bag with dismissed proposal cards filtered out (the island's `card.remove()`). */
function useFilteredPage(page: PageChromeBag | undefined, filter: (id: string) => boolean): PageChromeBag | undefined {
  return useMemo(() => {
    if (!page) return undefined;
    const proposals = (page.doc.proposals ?? []).filter((p) => filter(p.id));
    return proposals.length === (page.doc.proposals ?? []).length
      ? page
      : ({ ...page, doc: { ...page.doc, proposals } } as PageChromeBag);
  }, [page, filter]);
}

/** The IDE chrome publish — the `ide` bag verbatim + the Timeline extras the overview carries
 *  (the run-report surface's precedent: labels/hrefs + the identical gate card + the chat body). */
function useEditorChrome(
  shell: IdeTwinShell,
  slug: string,
  compact: boolean,
  readOnlyTitle?: string | null,
): void {
  const extras = useMemo<IdeChromeData>(
    () => ({
      ...(shell.ide.timelineView != null
        ? {
            timelineLabels,
            timelineCardLabels: runCardLabels,
            timelineHrefs: timelineHrefs(slug),
            renderGateCard: (run: Parameters<NonNullable<IdeChromeData["renderGateCard"]>>[0]) => (
              <TimelineGateCard run={run} slug={slug} compact={compact} readOnlyTitle={readOnlyTitle} />
            ),
          }
        : {}),
      ...(shell.ide.chat != null ? { chatBody: chatPanel(shell.ide.chat, slug, shell.ide, compact, readOnlyTitle) } : {}),
    }),
    [shell.ide, slug, compact, readOnlyTitle],
  );
  useShellChrome(shell, extras);
}

// ---------------------------------------------------------------------------------------------------------------------
// `/p/:slug` — the project Page leaf (R7HOME.2b, REQ-HOME-2): the head draft's Page IS the
// surface — the Needs-you rows/approval settings/voice picker moved to the Project settings
// page + the Inbox/Timeline.
// ---------------------------------------------------------------------------------------------------------------------

export interface EditorSurfaceProps<T> {
  readonly data: T;
  /** §10.1's phone verdict — boot-owned `deviceClass`, never the twin's. */
  readonly compact: boolean;
  /** the leaf's own search — the URL echoes merge here (never payload). */
  readonly search: Record<string, string | undefined>;
}

export function ProjectPageSurface({ data, compact, search }: EditorSurfaceProps<BffProjectTwin>): ReactNode {
  const router = useRouter();
  const { pending, mutError, write } = useEditorWrite();
  const viewRef = useRef<EditorView | null>(null);
  const seams = useProposalSeams(viewRef);
  const slug = data.project.slug;
  // R7RO.1 — the read-only fact (twin carrier, else boot slot); `run_lock` keeps the run's own
  // lifecycle controls (a waiting gate would deadlock otherwise) — see ProjectOverviewBody.
  const ro = useReadOnlyProject(data);

  // REQ-BETA-10 — the SSR document's `dwellSurface:"project"` heartbeat (the hook twin).
  useDwell("project");
  useEditorChrome(data, slug, compact, ro != null && ro.reason !== "run_lock" ? readOnlyReasonText(ro.reason) : null);

  const page = usePageBag(data.page);
  const pageView = useFilteredPage(page, seams.filter);

  // ---- the URL echoes (the document's `c.req.query` reads verbatim — never payload) ----
  const project = useMemo(
    () => ({
      ...data.project,
      ...(search["rename"] === "1" ? { rename: true } : {}),
      ...(search["hc"] ? { heldConsumed: search["hc"] } : {}),
      ...(["scratch", "outline", "draft"].includes(search["created"] ?? "")
        ? {
            created: {
              entry: search["created"] as "scratch" | "outline" | "draft",
              draftN: data.project.headDraftN ?? null,
              ...(search["cn"] != null || search["cu"] != null
                ? {
                    notes: {
                      warnings: Number(search["cn"] ?? 0) || 0,
                      unconverted: Number(search["cu"] ?? 0) || 0,
                    },
                  }
                : {}),
            },
          }
        : {}),
    }),
    [data.project, search],
  );
  const onSubmit = useMemo(() => delegatedSubmitHandler({ router, write }), [router, write]);

  return (
    <div data-spa-surface onSubmit={onSubmit} aria-busy={pending || undefined}>
      {search["hc"] ? <HeldConsumedMarker token={search["hc"]} /> : null}
      {ro != null ? <ReadOnlyNotice reason={ro.reason} slug={slug} /> : null}
      <ProjectOverviewBody
        project={project}
        {...(ro != null ? { readOnly: ro.reason } : {})}
        compact={compact}
        {...(pageView ? { page: pageView } : {})}
        {...(page ? { pageHost: <PageHost page={page} compact={compact} viewRef={viewRef} /> } : {})}
        pageEmbeds={false}
        onProposalAccept={seams.accept}
        onProposalReject={seams.reject}
      />
      {mutError != null ? (
        <p role="alert" style={{ fontSize: "12px", color: "var(--sev-major)", margin: "0 0 12px" }}>
          {mutError}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// `/p/:slug/v/:v` — the version Page (rail + PageEditor + the mount).
// ---------------------------------------------------------------------------------------------------------------------

export function VersionPageSurface({
  data,
  compact,
  search,
}: EditorSurfaceProps<Exclude<BffVersionPageTwin, { readonly ok: true }>>): ReactNode {
  const router = useRouter();
  const { pending, mutError, write } = useEditorWrite();
  const viewRef = useRef<EditorView | null>(null);
  const seams = useProposalSeams(viewRef);
  const slug = data.page.slug;
  const ro = useReadOnlyProject(data);

  useDwell("page");
  useEditorChrome(data, slug, compact, ro != null && ro.reason !== "run_lock" ? readOnlyReasonText(ro.reason) : null);

  const restoredQ = search["restored"];
  const restoredN = restoredQ != null ? Number(restoredQ) : null;
  const page = usePageBag(data.page, {
    ...(search["noted"] ? { noteSaved: true } : {}),
    ...(restoredN != null ? { restoredN } : {}),
  });
  const pageView = useFilteredPage(page, seams.filter);
  const onSubmit = useMemo(() => delegatedSubmitHandler({ router, write }), [router, write]);

  if (!pageView) return null;
  return (
    <ToastProvider dismissLabel={COPY.projectHome.undoLabel} viewportLabel={data.page.slug}>
      <ImportToast imported={search["imported"]} pn={search["pn"]} />
      <div data-spa-surface onSubmit={onSubmit} aria-busy={pending || undefined}>
        {search["hc"] ? <HeldConsumedMarker token={search["hc"]} /> : null}
        {ro != null ? <ReadOnlyNotice reason={ro.reason} slug={slug} /> : null}
      <PageChrome
        page={pageView}
        compact={compact}
        {...(ro != null ? { readOnlyReason: ro.reason } : {})}
        host={<PageHost page={pageView} compact={compact} viewRef={viewRef} />}
        embeds={false}
        onProposalAccept={seams.accept}
        onProposalReject={seams.reject}
      />
        {mutError != null ? (
          <p role="alert" style={{ fontSize: "12px", color: "var(--sev-major)", margin: "0 0 12px" }}>
            {mutError}
          </p>
        ) : null}
      </div>
    </ToastProvider>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// `/p/:slug/a/:artifactId` — the read-only artifact Page.
// ---------------------------------------------------------------------------------------------------------------------

export function ArtifactPageSurface({ data, compact }: EditorSurfaceProps<BffArtifactTwin>): ReactNode {
  const router = useRouter();
  const { pending, mutError, write } = useEditorWrite();
  const viewRef = useRef<EditorView | null>(null);
  const slug = data.page.slug;
  const ro = useReadOnlyProject(data);

  useDwell("page");
  useEditorChrome(data, slug, compact, ro != null && ro.reason !== "run_lock" ? readOnlyReasonText(ro.reason) : null);

  const page = usePageBag(data.page);
  const onSubmit = useMemo(() => delegatedSubmitHandler({ router, write }), [router, write]);

  if (!page) return null;
  return (
    <div data-spa-surface onSubmit={onSubmit} aria-busy={pending || undefined}>
      {ro != null ? <ReadOnlyNotice reason={ro.reason} slug={slug} /> : null}
      <PageChrome
        page={page}
        compact={compact}
        {...(ro != null ? { readOnlyReason: ro.reason } : {})}
        host={<PageHost page={page} compact={compact} viewRef={viewRef} />}
        embeds={false}
      />
      {mutError != null ? (
        <p role="alert" style={{ fontSize: "12px", color: "var(--sev-major)", margin: "0 0 12px" }}>
          {mutError}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// `/p/:slug/v/:n/diff/:m` — the §5.8 compare (three read-only layouts over the one projection).
// ---------------------------------------------------------------------------------------------------------------------

export function CompareSurface({ data, compact, search }: EditorSurfaceProps<BffCompareTwin>): ReactNode {
  const router = useRouter();
  const { pending, mutError, write } = useEditorWrite();
  const { compare } = data;
  const slug = compare.slug;
  const ro = useReadOnlyProject(data);

  useDwell("page");
  useEditorChrome(data, slug, compact, ro != null && ro.reason !== "run_lock" ? readOnlyReasonText(ro.reason) : null);

  const layoutQ = search["layout"];
  const layout = layoutQ === "inline" || layoutQ === "moves" ? layoutQ : "side";
  const commented = search["commented"] || undefined;
  const onSubmit = useMemo(() => delegatedSubmitHandler({ router, write }), [router, write]);

  return (
    <div data-spa-surface onSubmit={onSubmit} aria-busy={pending || undefined}>
      {ro != null ? <ReadOnlyNotice reason={ro.reason} slug={slug} /> : null}
      <CompareView
        beforeN={compare.data.before.n}
        afterN={compare.data.after.n}
        layout={layout}
        diff={compare.data.diff}
        // the wire shape is the findings-core view model modulo `unlinked.entries` being unknown[].
        view={compare.data.view as unknown as Parameters<typeof CompareView>[0]["view"]}
        linked={compare.data.responseId != null}
        layoutHref={(l) => `/p/${slug}/v/${compare.n}/diff/${compare.m}?layout=${l}`}
        {...(ro == null || ro.reason === "run_lock"
          ? {
              // DS §5.4 — comments stay live during a run lock (they become Guidance); demo/showcase
              // withhold the hunk-comment form before any request.
              commentFormAction: (hunkId: string) =>
                `/p/${slug}/v/${compare.n}/diff/${compare.m}/hunks/${hunkId}/comments`,
            }
          : {})}
        labels={compareLabels}
      />
      {commented ? (
        <p data-comment-saved="true" style={{ fontSize: "12px", color: "var(--state-ready)" }}>
          {COPY.revision.commentSavedLabel}
        </p>
      ) : null}
      {mutError != null ? (
        <p role="alert" style={{ fontSize: "12px", color: "var(--sev-major)", margin: "0 0 12px" }}>
          {mutError}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// `/p/:slug/revisions/:cid` — the What-changed read.
// ---------------------------------------------------------------------------------------------------------------------

export function RevisionSurface({ data, compact, search }: EditorSurfaceProps<BffRevisionTwin>): ReactNode {
  const router = useRouter();
  const { pending, mutError, write } = useEditorWrite();
  const { revision } = data;
  const slug = revision.slug;
  const ro = useReadOnlyProject(data);

  // the SSR document carries no dwellSurface on this page — no useDwell here (verbatim).
  useEditorChrome(data, slug, compact, ro != null && ro.reason !== "run_lock" ? readOnlyReasonText(ro.reason) : null);

  const commented = search["commented"] || undefined;
  const onSubmit = useMemo(() => delegatedSubmitHandler({ router, write }), [router, write]);

  return (
    <div data-spa-surface onSubmit={onSubmit} aria-busy={pending || undefined}>
      {ro != null ? <ReadOnlyNotice reason={ro.reason} slug={slug} /> : null}
      <WhatChangedView
        // the wire shape is the findings-core view model modulo `unlinked.entries` being unknown[].
        view={revision.data.view as unknown as Parameters<typeof WhatChangedView>[0]["view"]}
        beforeN={revision.data.beforeN}
        afterN={revision.data.afterN}
        {...(ro == null || ro.reason === "run_lock"
          ? {
              commentFormAction: (hunkId: string) =>
                `/p/${slug}/revisions/${revision.data.responseId}/hunks/${hunkId}/comments`,
            }
          : {})}
        labels={whatChangedLabels}
      />
      {commented ? (
        <p data-comment-saved="true" style={{ fontSize: "12px", color: "var(--state-ready)" }}>
          {COPY.revision.commentSavedLabel}
        </p>
      ) : null}
      {mutError != null ? (
        <p role="alert" style={{ fontSize: "12px", color: "var(--sev-major)", margin: "0 0 12px" }}>
          {mutError}
        </p>
      ) : null}
    </div>
  );
}


