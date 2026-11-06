// SPA.21 — the `dossier` surface leaves (design/22 §2 `p.review` + `p.obligationNew` rows;
// design/25's `p.review` is IDE-framed — REQ-SEQ-12's `dossier` × `ide-chrome` AND-gate —
// `p.obligationNew` is deliberately unframed). REQ-BFF-1..11, REQ-SEQ-6, REQ-UX-16, REQ-VFY-4.
// Both leaves mount the SHARED compositions the SSR document emits — `DossierArticle` +
// `dossierSurfaces` (../../dossier-view.js, pages.tsx's own page body) and the
// `ObligationNewPage` markup verbatim — so the dom-contract's dossier vocabulary is
// attribute-for-attribute identical across renderers (the gate-card.tsx precedent).
//
//   • Client-side filter port (design/22 OQ8 option (b)): `sev`/`kind`/`disp`/`sec`/`url`/`sug`/
//     `obl`/`triage` are the leaf's own validated route search — `visibleDossierFindings`
//     re-derives the server-identical set (the §5.7 severity budget first, then the shared
//     filters) with NO refetch, and the chrome's findings ticks publish the SAME filtered list
//     so the Margin/Desk/Page move together exactly like the SSR `comp.filteredRows`. The twin
//     URL carries only the server-owned keys (`bulk`/`bsec`/`gate` + the `?disposed`-family
//     flashes + `?focus`) — a filter nav is an instant re-render, not a fetch.
//   • Mutations are the SAME document POST paths re-issued as JSON (design/22 §3 — the DOM
//     contract is the wire contract): a delegated submit handler collects the field map BEFORE
//     the busy-disable (a disabled control drops out of the post — collect-first is load-bearing),
//     posts `{json}` through `bffFetch` (the `wantsJson` branch server-side), and lands the
//     `{ok,redirect}` envelope via `router.navigate` — the flash-parameterized URL is the 302's
//     identical twin, so `?disposed=`/`?applied=`/`?bulkdone=` repaint off a fresh twin read,
//     never optimistic state. `{url}` hand-offs document-navigate verbatim. A refusal repaints
//     the SSR's own arms — the `?ferr`/`fmsg` notice line (`data-finding-notice="error"`) plus
//     the under-card `dispositionError` — with the api's `detail` verbatim (the voices.tsx
//     `err.detail ?? err.code` precedent).
//   • The Desk's `data-findings-filters` bar is a `method="get"` form — intercepted into an
//     in-router nav to the same `?sev=&kind=&disp=` URL it would have built (the URL is the
//     state), so filter changes never leave the SPA.
//   • `useGatePresence` + `useShowcaseAnchorBeacon` carry the two inline scripts' effects —
//     innerHTML `<script>`s never execute inside a React mount, so the shared article renders
//     `beacon={false}`/`gatePresenceScript={false}` and the leaf mounts the hook twins
//     (the inbox.tsx precedent). Presence arms only when the focused gate's own model says
//     `autoProceed` — identical gating to the SSR script.
//
// Forms that are NOT dossier writes (the Showcase banner's `/p/:slug/duplicate`, the run card's
// steering POSTs, the chat panel's self-intercepted submits) stay native — the delegated handler
// scopes to an explicit `/p/…` write-path grammar and skips `defaultPrevented` submits.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { GateCardDto } from "@rhema/api-client";
import type { GateDecisionView, TimelineRun } from "@rhema/findings-core";
import { COPY } from "../../copy.js";
import {
  DossierArticle,
  dossierSurfaces,
  runCardLabels,
  timelineHrefs,
  timelineLabels,
  visibleDossierFindings,
  type DossierViewState,
} from "../../dossier-view.js";
import { chatPanel } from "../../chat-pane.js";
import { gateCardFor, gateCardModel } from "../../gate-card.js";
import { BffError, bffFetch } from "../bff.js";
import { useGatePresence } from "../gate-presence.js";
import { useReadOnlyProject, readOnlyReasonText, ReadOnlyNotice } from "../read-only.js";
import { PageBody, PageHeader } from "../page-header.js";
// R7RO.1 — the showcase notice is the dossier's OWN banner (DossierArticle, verbatim copy); the
// generic notice mounts only for `demo` — a showcase dossier never sees two notices.
import type { IdeChromeData } from "../ide/chrome-data.js";
import { useShellChrome } from "../ide/chrome-data.js";
import { useShowcaseAnchorBeacon } from "../showcase-beacon.js";
import type { BffDossierTwin, BffObligationNewTwin } from "../queries.js";
// R7RELOAD.1 (REQ-RELOAD-2) — the ONE shared write grammar + delegated submit: the surface's
// own `onSubmit` claims its leaf forms and the IdeChrome host's identical handler covers the
// pane bodies (`PaneBusy` is the wrapper half; the per-surface `DOSSIER_WRITE` is retired).
import {
  collectJsonFields,
  delegatedSubmitHandler,
  setFormBusy,
  usePaneWrite,
  PaneBusy,
  type MutationReply,
} from "../write-paths.js";

/** One dossier write — the shared mutation with the dossier's `?ferr`-parity error arm. */
function useDossierWrite() {
  const router = useRouter();
  const [mutError, setMutError] = useState<{ findingId: string; message: string } | null>(null);
  const { pending, write } = usePaneWrite({
    onError: (err, vars) => {
      // The SSR's `?ferr=<fid>&fmsg=<msg>` arm verbatim: the notice line carries the api's stable
      // detail/code (never a client literal); the card's under-form error shows when the refused
      // write named a finding (bulk/gate misses land the notice alone — `ferr=bulk` parity).
      const fid = /\/findings\/([^/]+)\//.exec(vars.action)?.[1] ?? "";
      const message =
        err instanceof BffError ? (err.detail ?? err.code) : COPY.spaError.body;
      setMutError({ findingId: fid, message });
    },
  });
  return { busy: pending, mutError, write, router };
}

/** The Timeline run-card's gate mount — `renderGateCard` verbatim from the SSR `IdeFrame`, with
 *  `presenceScript:false` + `useGatePresence` carrying the REQ-SPEC-18 pings per card. Exported:
 *  SPA.22's run-report surface mounts the same Timeline pane. */
export function TimelineGateCard({
  run,
  slug,
  compact,
  readOnlyTitle,
}: {
  readonly run: TimelineRun;
  readonly slug: string;
  readonly compact: boolean;
  /** R7RO.1 — read-only projects wrap the card's decide controls (disabled + tooltip). */
  readonly readOnlyTitle?: string | null;
}): ReactNode {
  const gate = run.gate as GateCardDto | undefined;
  const autoProceed = gate != null ? gateCardModel(gate, compact).autoProceed : false;
  const ref = useGatePresence<HTMLDivElement>(
    autoProceed && gate != null ? `/p/${slug}/gates/${gate.id}/activity` : null,
  );
  if (gate == null) return undefined;
  return (
    <div ref={ref}>
      {gateCardFor(gate, slug, compact, undefined, {
        presenceScript: false,
        ...(readOnlyTitle != null ? { readOnlyTitle } : {}),
        ...((run.card as { decisions?: readonly GateDecisionView[] } | undefined)?.decisions != null
          ? { decisions: (run.card as { decisions?: readonly GateDecisionView[] }).decisions }
          : {}),
      })}
    </div>
  );
}

// ---- `/p/:slug/review/:runId` — the delivered-review dossier ------------------------------------

export interface DossierSurfaceProps {
  /** the `GET /bff/p/:slug/review/:runId` aggregate twin. */
  readonly data: BffDossierTwin;
  /** the route's validated search — the leaf-owned filter keys + the server-owned twin keys. */
  readonly search: Record<string, string | undefined>;
  /** §10.1's phone verdict — boot-owned `deviceClass`, never the twin's. */
  readonly compact: boolean;
}

export function DossierSurface({ data, search, compact }: DossierSurfaceProps): ReactNode {
  const { busy, mutError, write, router } = useDossierWrite();
  const dossier = data.dossier;
  const slug = dossier.slug;
  // R7RO.1 — the read-only fact (the twin's carrier, else the boot slot); `run_lock` never arms
  // the dossier's write census (those are run-lifecycle writes, kept live on purpose).
  const ro = useReadOnlyProject(data);
  const roTip = ro != null && ro.reason !== "run_lock" ? readOnlyReasonText(ro.reason) : null;

  // The leaf-owned filter/triage arms — the route's validated search, verbatim the GET grammar.
  const filters = useMemo<Record<string, string | undefined>>(
    () => ({
      sev: search["sev"],
      kind: search["kind"],
      disp: search["disp"],
      sec: search["sec"],
      url: search["url"],
      sug: search["sug"],
      obl: search["obl"],
    }),
    [search],
  );
  const triage = search["triage"] === "1";

  // The server-decided arms ride the twin (`bulk`/`bulkDone`/`notice`/`focusedGate`); the leaf's
  // own filter set + a refused write's `ferr`-parity notice override client-side.
  const view = useMemo<DossierViewState>(
    () => ({
      ...data.dossierView,
      filters,
      triage,
      ...(mutError != null
        ? { notice: { kind: "error" as const, findingId: mutError.findingId, message: mutError.message } }
        : {}),
    }),
    [data.dossierView, filters, triage, mutError],
  );

  // Memoized — this object is a dep of `panes` → `extras` → the chrome publish, which re-renders
  // the leaf through the layout's Outlet. A fresh literal here is a publish/render loop.
  const dispositionError = useMemo(
    () =>
      mutError != null && mutError.findingId !== ""
        ? { findingId: mutError.findingId, message: mutError.message }
        : data.triage?.dispositionError,
    [mutError, data.triage?.dispositionError],
  );

  const onSubmit = useMemo(
    () => delegatedSubmitHandler({ router, write }),
    [router, write],
  );

  // REQ-SPEC-18 — the focused `?gate=` card's presence pings mount exactly where the SSR's inline
  // script would have: only an `autoProceed` card gets a live activity URL.
  const focusedGate = data.dossierView.focusedGate;
  const focusAutoProceed = focusedGate != null ? gateCardModel(focusedGate, compact).autoProceed : false;
  const presenceRef = useGatePresence<HTMLDivElement>(
    focusAutoProceed && focusedGate != null ? `/p/${slug}/gates/${focusedGate.id}/activity` : null,
  );

  // P1.17 — the Showcase anchor beacon (the inline script's hook twin).
  useShowcaseAnchorBeacon(dossier.showcase === true ? dossier.firstFindingId : undefined);

  // P1.07 — one list powers the Page, the Margin, and the Desk: the leaf re-derives the
  // server-identical filtered set off the raw findings (budget first, then the filters).
  const visible = useMemo(() => visibleDossierFindings(dossier, filters), [dossier, filters]);
  const panes = useMemo(
    () =>
      dossierSurfaces({
        dossier,
        dossierView: view,
        triage: {
          ...(data.triage?.dispositionError != null ? { dispositionError: data.triage.dispositionError } : {}),
          ...(data.triage?.savedFindingId != null ? { savedFindingId: data.triage.savedFindingId } : {}),
          ...(dispositionError != null ? { dispositionError } : {}),
        },
        compact,
        readOnly: roTip,
      }),
    [dossier, view, data.triage?.dispositionError, data.triage?.savedFindingId, dispositionError, compact, roTip],
  );

  const extras = useMemo<IdeChromeData>(
    () => ({
      // The ticks echo the SHARED filtered list (the SSR handler's `comp.filteredRows` overlay).
      findings: visible.map((f) => ({ id: f.id, severity: f.severity, kind: f.kind, excerpt: f.title })),
      // R7RELOAD.1 — the pane bodies no longer carry their own submit intercepts: the IdeChrome
      // host's ONE delegated handler covers them (the wrapper now only marks aria-busy).
      ...(panes.marginBody != null
        ? { marginBody: <PaneBusy busy={busy}>{panes.marginBody}</PaneBusy> }
        : {}),
      ...(panes.deskFindingsBody != null
        ? { deskFindingsBody: <PaneBusy busy={busy}>{panes.deskFindingsBody}</PaneBusy> }
        : {}),
      ...(data.ide.chat != null
        ? { chatBody: <PaneBusy busy={busy}>{chatPanel(data.ide.chat, slug, data.ide, compact)}</PaneBusy> }
        : {}),
      ...(data.ide.timelineView != null
        ? {
            timelineLabels,
            timelineCardLabels: runCardLabels,
            timelineHrefs: timelineHrefs(slug),
            // P1.09 — the waiting run mounts the IDENTICAL §6.4 card (presence via the hook twin).
            renderGateCard: (run: TimelineRun) => (
              <TimelineGateCard run={run} slug={slug} compact={compact} readOnlyTitle={roTip} />
            ),
          }
        : {}),
    }),
    [visible, panes, data.ide, slug, compact, busy, onSubmit],
  );
  useShellChrome(data, extras);

  return (
    <div data-spa-surface ref={presenceRef} onSubmit={onSubmit} aria-busy={busy || undefined}>
      {ro != null && ro.reason === "demo" ? <ReadOnlyNotice reason={ro.reason} slug={slug} /> : null}
      <DossierArticle
        dossier={dossier}
        compact={compact}
        dossierView={view}
        {...(dispositionError != null ? { dispositionError } : {})}
        {...(data.triage?.savedFindingId != null ? { savedFindingId: data.triage.savedFindingId } : {})}
        beacon={false}
        gatePresenceScript={false}
      />
      {/* P1.19 — §10.1: below ~768 px the Desk is display:none, so the chat surface mounts INSIDE
          the Page (the SSR IdeFrame's `data-phone-chat` section verbatim). */}
      {compact === true && data.ide.chat != null ? (
        <section
          className="ide-phone-only"
          data-phone-chat="true"
          aria-label={COPY.ide.panel.tabs.chat}
          style={{ marginTop: "24px", borderTop: "1px solid var(--paper-rule)", paddingTop: "12px" }}
        >
          {chatPanel(data.ide.chat, slug, data.ide, true)}
        </section>
      ) : null}
    </div>
  );
}

// ---- `/p/:slug/obligations/new` — the one-field obligation sheet (unframed) ---------------------

// pages.tsx `fieldStyle` verbatim — the obligation sheet's one input keeps the SSR styling.
const obligationFieldStyle = {
  display: "block",
  width: "100%",
  padding: "8px 10px",
  marginTop: "4px",
  borderRadius: "8px",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-bg)",
  color: "var(--shell-fg)",
  fontSize: "14px",
  boxSizing: "border-box" as const,
};

/** The obligation sheet's severity options — `ObligationNewPage`'s literal `>blocking<`…`>note<`
 *  verbatim (the value IS the label; rendered as expressions for the copy-containment sweep). */
const OBLIGATION_SEVERITIES = ["blocking", "major", "minor", "note"] as const;

/**
 * `ObligationNewPage`'s markup verbatim on the `GET /bff/p/:slug/obligations/new` twin — heading,
 * lede, the alert slot, the one-field form posting `/p/:slug/obligations` as JSON (`{ok,redirect}`
 * → in-router nav to `next` + `?obligation=new`; the 422/`detail` refusal lands the SAME
 * `role="alert"` slot the document's re-render carried), and the `?back`-confined Cancel.
 */
export function ObligationNewSurface({ data }: { readonly data: BffObligationNewTwin }): ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const sheet = data.obligationNew;
  const slug = sheet.slug;
  // R7RO.1 — the twin carries the read-only fact on its own bag; under a reason the create form
  // withholds (disabled fieldset + the reason tooltip) before any request.
  const ro = useReadOnlyProject({ project: sheet });
  const roTip = ro != null && ro.reason !== "run_lock" ? readOnlyReasonText(ro.reason) : null;
  const create = useMutation<MutationReply, unknown, { form: HTMLFormElement; json: Record<string, string | string[]> }>({
    mutationFn: async ({ json }) => {
      return bffFetch<MutationReply>(`/p/${slug}/obligations`, { method: "POST", json });
    },
    onMutate: ({ form }) => {
      setError(null);
      setFormBusy(form, true);
    },
    onSuccess: (env) => {
      if (env.redirect != null) void router.navigate({ href: env.redirect });
    },
    onError: (err) => {
      // The document's re-rendered `role="alert"` verbatim — the api's `detail` (the 422's
      // `title_required` carries `COPY.obligation.required` verbatim) else the stable code.
      setError(err instanceof BffError ? (err.detail ?? err.code) : COPY.obligation.failed);
    },
    onSettled: (_e, _er, vars) => {
      setFormBusy(vars.form, false);
      void queryClient.invalidateQueries({ queryKey: ["bff"] });
    },
  });
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (form.getAttribute("aria-busy") === "true") return;
    create.mutate({ form, json: collectJsonFields(form) });
  };
  return (
    <div data-spa-surface>
      {ro != null ? <ReadOnlyNotice reason={ro.reason} slug={slug} /> : null}
      <PageBody>
        {/* R7SHELL.1b — the project-title nav idiom becomes the Project › Surface crumb. */}
        <PageHeader
          title={COPY.obligation.heading}
          crumbs={[{ label: sheet.projectTitle, href: `/p/${slug}` }, { label: COPY.obligation.heading }]}
        />
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", maxWidth: "68ch" }}>{COPY.obligation.lede}</p>
        {error != null ? (
          <p role="alert" style={{ color: "var(--sev-major)", fontSize: "13px" }}>{error}</p>
        ) : null}
        {roTip != null ? (
          // R7RO.1 — the withheld create form (disabled + reason tooltip, before any request).
          <fieldset disabled title={roTip} style={{ maxWidth: "68ch", border: 0, margin: 0, padding: 0 }}>
            <p data-readonly-controls="obligation" style={{ fontSize: "13px", color: "var(--shell-fg-faint)" }}>{roTip}</p>
          </fieldset>
        ) : null}
        <form method="post" action={`/p/${slug}/obligations`} data-obligation-form="true" style={{ maxWidth: "68ch" }} onSubmit={onSubmit} hidden={roTip != null}>
          <input type="hidden" name="next" value={sheet.back || `/p/${slug}`} />
          <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block" }}>
            {COPY.obligation.titleLabel}
            <input name="title" required placeholder={COPY.obligation.titlePlaceholder} style={obligationFieldStyle} />
          </label>
          <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "12px" }}>
            {COPY.obligation.severityLabel}{" "}
            <select name="severity" defaultValue="minor" style={{ fontSize: "13px" }}>
              {/* the option VALUES are the labels — the SSR page's literal `>blocking<` verbatim
                  (an expression keeps the REQ-SAFE-10 copy-containment sweep honest). */}
              {OBLIGATION_SEVERITIES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>{COPY.obligation.severityHint}</p>
          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <button type="submit" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
              {COPY.obligation.createCta}
            </button>
            <a href={sheet.back || `/p/${slug}`} style={{ padding: "8px 16px", fontSize: "14px", color: "var(--shell-fg-muted)" }}>
              {COPY.obligation.cancel}
            </a>
          </div>
        </form>
      </PageBody>
    </div>
  );
}
