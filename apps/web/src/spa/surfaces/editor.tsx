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

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode, type SyntheticEvent } from "react";
import type { EditorView } from "prosemirror-view";
import { acceptProposalTr, markdownToDoc, type EditOrigin, type FindingForDecoration, type Proposal } from "@rhema/editor";
import { ApprovalRow, CompareView, WhatChangedView } from "@rhema/ui";
import { COPY } from "../../copy.js";
import { deleteHold, getHold } from "../../client/hold-store.js";
import { chatPanel } from "../../chat-pane.js";
import { runCardLabels, timelineHrefs, timelineLabels, type TriageSurfaceState } from "../../dossier-view.js";
import {
  PageChrome,
  ProjectOverviewBody,
  compareLabels,
  whatChangedLabels,
  type ApprovalRowSpec,
  type PageChromeBag,
} from "../../page-chrome.js";
import { approvalRowLabels } from "../../gate-card.js";
import { useGatePresence } from "../gate-presence.js";
import { BffError, bffFetch } from "../bff.js";
import { navigateDocument } from "../dom.js";
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
import { PageMount } from "../page-mount.js";
import { TimelineGateCard } from "./dossier.js";

/** The mutation success envelope (`{ok:true, redirect?, url?}` — the document's 302 twin). */
interface MutationReply {
  readonly ok: true;
  readonly redirect?: string;
  readonly url?: string;
}

/**
 * The editor surface's write grammar — every same-origin POST a control inside these leaves can
 * issue. Each has a `wantsJson` branch on the server (SPA.23); anything outside this grammar
 * keeps its native leg (the document nav still answers it — the dossier.tsx precedent).
 */
const EDITOR_WRITE = /^\/p\/[^/]+\/(edit\/[^/]+\/(?:note|cancel-run|revise)|v\/[^/]+\/restore\/[^/]+|v\/[^/]+\/diff\/[^/]+\/hunks\/[^/]+\/comments|revisions\/[^/]+\/hunks\/[^/]+\/comments|rename|approval-overrides|voice|voice\/adopt|voice\/fork|gates\/[^/]+|decisions\/[^/]+)$/;

/** A form `action` to its same-origin pathname (null ⇒ not interceptable). */
function actionPath(action: string): string | null {
  try {
    const u = new URL(action, "https://rhema.invalid");
    return u.origin === "https://rhema.invalid" ? u.pathname : null;
  } catch {
    return null;
  }
}

/** REQ-UX-16's in-flight affordance — `aria-busy` + disabled controls, restored on settle. */
function setFormBusy(form: HTMLFormElement, busy: boolean): void {
  if (busy) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
  for (const el of form.querySelectorAll("button, input, select, textarea")) {
    if (el instanceof HTMLElement && "disabled" in el) {
      (el as HTMLButtonElement).disabled = busy;
    }
  }
}

/** The form's named fields as a flat map — read BEFORE any busy-disable pass. */
function collectJsonFields(form: HTMLFormElement): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const push = (name: string, value: string): void => {
    const prev = out[name];
    if (prev == null) out[name] = value;
    else if (Array.isArray(prev)) prev.push(value);
    else out[name] = [prev, value];
  };
  for (const el of form.querySelectorAll("input, select, textarea")) {
    const name = el.getAttribute("name");
    if (name == null || name === "") continue;
    if (el instanceof HTMLInputElement) {
      if (el.disabled) continue;
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) push(name, el.value === "" ? "on" : el.value);
        continue;
      }
      push(name, el.value);
      continue;
    }
    if (el instanceof HTMLTextAreaElement && !el.disabled) {
      push(name, el.value);
      continue;
    }
    if (el instanceof HTMLSelectElement && !el.disabled) {
      if (el.multiple) {
        for (const opt of el.selectedOptions) push(name, opt.value);
      } else {
        push(name, el.value);
      }
    }
  }
  return out;
}

/** The delegated submit leg — a `method="post"` form whose action names an editor-surface write
 *  becomes the JSON envelope call; everything else keeps its native leg. */
function editorSubmitHandler(opts: {
  readonly write: (vars: {
    form: HTMLFormElement;
    action: string;
    json: Record<string, string | string[]>;
  }) => void;
}): (e: SyntheticEvent) => void {
  return (e) => {
    if (e.defaultPrevented) return;
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    const actionAttr = form.getAttribute("action") ?? "";
    if (!actionAttr.startsWith("/p/")) return;
    if ((form.getAttribute("method") ?? "get").toLowerCase() !== "post") return;
    const path = actionPath(actionAttr);
    if (path == null || !EDITOR_WRITE.test(path)) return;
    e.preventDefault();
    if (form.getAttribute("aria-busy") === "true") return;
    const json = collectJsonFields(form);
    const submitter = (e.nativeEvent as Partial<SubmitEvent>).submitter;
    if (submitter instanceof HTMLElement) {
      const n = submitter.getAttribute("name");
      if (n != null && n !== "") json[n] = submitter.getAttribute("value") ?? "on";
    }
    opts.write({ form, action: path, json });
  };
}

/** One editor-surface write — mutation + busy settle + the `{ok,redirect}`/`{error}` envelope read. */
function useEditorWrite() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mutError, setMutError] = useState<string | null>(null);
  const mutation = useMutation<
    MutationReply,
    unknown,
    { form: HTMLFormElement; action: string; json: Record<string, string | string[]> }
  >({
    mutationFn: async ({ action, json }) => {
      return bffFetch<MutationReply>(action, { method: "POST", json });
    },
    onMutate: ({ form }) => {
      setMutError(null);
      setFormBusy(form, true);
    },
    onSuccess: (env) => {
      if (env.url != null) {
        navigateDocument(env.url);
        return;
      }
      if (env.redirect != null) {
        // The 302's identical twin — `…/v/:n?restored=`/`?noted=1`/`?commented=` land the fresh
        // twin read + the echo, verbatim. Off-route hrefs (the `/edit/:draftId` hop — not an SPA
        // route) degrade to the document nav, which still answers them.
        try {
          void router.navigate({ href: env.redirect });
        } catch {
          navigateDocument(env.redirect);
        }
        return;
      }
    },
    onError: (err) => {
      // Stale-state writes (design/22 §3): a refused write — lock held/canceled/frozen (400/403/
      // 404/409) — is the SSR's silent re-render: `onSettled`'s invalidate re-reads the twin and
      // the post-decision page is the answer. Only a real fault lands the alert line.
      if (err instanceof BffError && [400, 403, 404, 409].includes(err.status)) return;
      setMutError(err instanceof BffError ? (err.detail ?? err.code) : COPY.spaError.body);
    },
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      void queryClient.invalidateQueries({ queryKey: ["bff"] });
    },
  });
  return { mutation, mutError, write: mutation.mutate };
}

// ---------------------------------------------------------------------------------------------------------------------
// The ONB.1 held-consumed handshake (`?hc=<token>`): the leaf renders the verbatim
// `data-held-consumed` marker and runs the same token-matched delete the `landing.js` island
// runs — the hold dies to a server-confirmed consumption, never to a page view.
// ---------------------------------------------------------------------------------------------------------------------

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
  const docJson = useMemo(() => (markdown == null ? undefined : markdownToDoc(markdown).toJSON()), [markdown]);
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
): void {
  const extras = useMemo<IdeChromeData>(
    () => ({
      ...(shell.ide.timelineView != null
        ? {
            timelineLabels,
            timelineCardLabels: runCardLabels,
            timelineHrefs: timelineHrefs(slug),
            renderGateCard: (run: Parameters<NonNullable<IdeChromeData["renderGateCard"]>>[0]) => (
              <TimelineGateCard run={run} slug={slug} compact={compact} />
            ),
          }
        : {}),
      ...(shell.ide.chat != null ? { chatBody: chatPanel(shell.ide.chat, slug, shell.ide, compact) } : {}),
    }),
    [shell.ide, slug, compact],
  );
  useShellChrome(shell, extras);
}

/** One Needs-you row under the React renderer — `useGatePresence` carries REQ-SPEC-18's
 *  `activity: present|blur|reading` pings (the inline `<script>` never executes inside a React
 *  mount); only `model.autoProceed` cards arm a live `activityUrl`, matching the SSR emission. */
function SpaApprovalRow({ slug, spec }: { readonly slug: string; readonly spec: ApprovalRowSpec }): ReactNode {
  const presenceRef = useGatePresence<HTMLDetailsElement>(
    spec.model.autoProceed ? `/p/${slug}/gates/${spec.gateId}/activity` : null,
  );
  return (
    <ApprovalRow
      gateId={spec.gateId}
      model={spec.model}
      {...(spec.artifact ? { artifact: spec.artifact } : {})}
      labels={approvalRowLabels}
      card={spec.card}
      rowRef={presenceRef}
    />
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// `/p/:slug` — the project overview leaf (the working-head Page mount + Needs-you + the §6.4
// settings + the voice picker verbatim).
// ---------------------------------------------------------------------------------------------------------------------

export interface EditorSurfaceProps<T> {
  readonly data: T;
  /** §10.1's phone verdict — boot-owned `deviceClass`, never the twin's. */
  readonly compact: boolean;
  /** the leaf's own search — the URL echoes merge here (never payload). */
  readonly search: Record<string, string | undefined>;
}

export function ProjectPageSurface({ data, compact, search }: EditorSurfaceProps<BffProjectTwin>): ReactNode {
  const { mutation, mutError, write } = useEditorWrite();
  const viewRef = useRef<EditorView | null>(null);
  const seams = useProposalSeams(viewRef);
  const slug = data.project.slug;

  // REQ-BETA-10 — the SSR document's `dwellSurface:"project"` heartbeat (the hook twin).
  useDwell("project");
  useEditorChrome(data, slug, compact);

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
  const triage = useMemo<TriageSurfaceState | undefined>(
    () =>
      search["derror"]
        ? { dispositionError: { findingId: search["derror"], message: COPY.triage.noteRequired } }
        : undefined,
    [search],
  );
  const projectVoice = useMemo(
    () =>
      data.projectVoice
        ? { ...data.projectVoice, ...(search["voice_locked"] === "1" ? { locked: true as const } : {}) }
        : undefined,
    [data.projectVoice, search],
  );

  const onSubmit = useMemo(() => editorSubmitHandler({ write }), [write]);

  return (
    <div data-spa-surface onSubmit={onSubmit} aria-busy={mutation.isPending || undefined}>
      {search["hc"] ? <HeldConsumedMarker token={search["hc"]} /> : null}
      <ProjectOverviewBody
        project={project}
        spa
        renderApprovalRow={(spec) => <SpaApprovalRow slug={slug} spec={spec} />}
        gates={data.gates}
        decisions={data.decisions}
        approvalOverrides={data.approvalOverrides}
        {...(data.approvalSettings ? { approvalSettings: data.approvalSettings } : {})}
        explainersDismissed={data.explainersDismissed}
        compact={compact}
        {...(triage ? { triage } : {})}
        {...(projectVoice ? { projectVoice } : {})}
        {...(pageView ? { page: pageView } : {})}
        {...(data.ide.timelineView ? { timelineView: data.ide.timelineView } : {})}
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
  const { mutation, mutError, write } = useEditorWrite();
  const viewRef = useRef<EditorView | null>(null);
  const seams = useProposalSeams(viewRef);
  const slug = data.page.slug;

  useDwell("page");
  useEditorChrome(data, slug, compact);

  const restoredQ = search["restored"];
  const restoredN = restoredQ != null ? Number(restoredQ) : null;
  const page = usePageBag(data.page, {
    ...(search["noted"] ? { noteSaved: true } : {}),
    ...(restoredN != null ? { restoredN } : {}),
  });
  const pageView = useFilteredPage(page, seams.filter);
  const onSubmit = useMemo(() => editorSubmitHandler({ write }), [write]);

  if (!pageView) return null;
  return (
    <div data-spa-surface onSubmit={onSubmit} aria-busy={mutation.isPending || undefined}>
      {search["hc"] ? <HeldConsumedMarker token={search["hc"]} /> : null}
      <PageChrome
        page={pageView}
        compact={compact}
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
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// `/p/:slug/a/:artifactId` — the read-only artifact Page.
// ---------------------------------------------------------------------------------------------------------------------

export function ArtifactPageSurface({ data, compact }: EditorSurfaceProps<BffArtifactTwin>): ReactNode {
  const { mutation, mutError, write } = useEditorWrite();
  const viewRef = useRef<EditorView | null>(null);
  const slug = data.page.slug;

  useDwell("page");
  useEditorChrome(data, slug, compact);

  const page = usePageBag(data.page);
  const onSubmit = useMemo(() => editorSubmitHandler({ write }), [write]);

  if (!page) return null;
  return (
    <div data-spa-surface onSubmit={onSubmit} aria-busy={mutation.isPending || undefined}>
      <PageChrome
        page={page}
        compact={compact}
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
  const { mutation, mutError, write } = useEditorWrite();
  const { compare } = data;
  const slug = compare.slug;

  useDwell("page");
  useEditorChrome(data, slug, compact);

  const layoutQ = search["layout"];
  const layout = layoutQ === "inline" || layoutQ === "moves" ? layoutQ : "side";
  const commented = search["commented"] || undefined;
  const onSubmit = useMemo(() => editorSubmitHandler({ write }), [write]);

  return (
    <div data-spa-surface onSubmit={onSubmit} aria-busy={mutation.isPending || undefined}>
      <CompareView
        beforeN={compare.data.before.n}
        afterN={compare.data.after.n}
        layout={layout}
        diff={compare.data.diff}
        // the wire shape is the findings-core view model modulo `unlinked.entries` being unknown[].
        view={compare.data.view as unknown as Parameters<typeof CompareView>[0]["view"]}
        linked={compare.data.responseId != null}
        layoutHref={(l) => `/p/${slug}/v/${compare.n}/diff/${compare.m}?layout=${l}`}
        commentFormAction={(hunkId) => `/p/${slug}/v/${compare.n}/diff/${compare.m}/hunks/${hunkId}/comments`}
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
  const { mutation, mutError, write } = useEditorWrite();
  const { revision } = data;
  const slug = revision.slug;

  // the SSR document carries no dwellSurface on this page — no useDwell here (verbatim).
  useEditorChrome(data, slug, compact);

  const commented = search["commented"] || undefined;
  const onSubmit = useMemo(() => editorSubmitHandler({ write }), [write]);

  return (
    <div data-spa-surface onSubmit={onSubmit} aria-busy={mutation.isPending || undefined}>
      <WhatChangedView
        // the wire shape is the findings-core view model modulo `unlinked.entries` being unknown[].
        view={revision.data.view as unknown as Parameters<typeof WhatChangedView>[0]["view"]}
        beforeN={revision.data.beforeN}
        afterN={revision.data.afterN}
        commentFormAction={(hunkId) => `/p/${slug}/revisions/${revision.data.responseId}/hunks/${hunkId}/comments`}
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


