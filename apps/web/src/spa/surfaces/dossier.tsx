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
import { useMemo, useState, type FormEvent, type ReactNode, type SyntheticEvent } from "react";
import { PageTitle, Shell } from "@rhema/ui";
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
import { navigateDocument } from "../dom.js";
import { useGatePresence } from "../gate-presence.js";
import { useReadOnlyProject, readOnlyReasonText, ReadOnlyNotice } from "../read-only.js";
// R7RO.1 — the showcase notice is the dossier's OWN banner (DossierArticle, verbatim copy); the
// generic notice mounts only for `demo` — a showcase dossier never sees two notices.
import type { IdeChromeData } from "../ide/chrome-data.js";
import { useShellChrome } from "../ide/chrome-data.js";
import { useShowcaseAnchorBeacon } from "../showcase-beacon.js";
import type { BffDossierTwin, BffObligationNewTwin } from "../queries.js";

/** The mutation success envelope (`{ok:true, redirect?, url?}` — `url` is the allowlist hand-off). */
interface MutationReply {
  readonly ok: true;
  readonly redirect?: string;
  readonly url?: string;
}

/**
 * The dossier surface's JSON write paths — every one carries a `wantsJson` branch server-side
 * (SPA.21): per-finding disposition/apply/promote/obligations on BOTH mounts (the dossier's
 * runId path and the project-scoped path a pane form posts), the consolidated bulk
 * preview/dispatch, the gate card's decide POST, and the free-form obligation create. Anything
 * outside this grammar stays a native form post (the strangler's document nav still answers it).
 */
const DOSSIER_WRITE =
  /^\/p\/[^/]+\/(?:review\/[^/]+\/findings\/[^/]+\/(?:disposition|apply|promote|obligations)|findings\/[^/]+\/(?:disposition|apply|promote|obligations)|review\/[^/]+\/findings\/bulk(?:-preview)?|gates\/[^/]+|obligations)$/;

/** A form `action` to its same-origin pathname (null ⇒ not interceptable). */
function actionPath(action: string): string | null {
  try {
    const u = new URL(action, "https://rhema.invalid");
    return u.origin === "https://rhema.invalid" ? u.pathname : null;
  } catch {
    return null;
  }
}

/** REQ-UX-16's in-flight affordance — `aria-busy` + disabled controls, restored on settle
 *  (the run-sheet.tsx/outline.tsx precedent — imperative because the field map stays form-native). */
function setFormBusy(form: HTMLFormElement, busy: boolean): void {
  if (busy) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
  for (const el of form.querySelectorAll("button, input, select, textarea")) {
    if (el instanceof HTMLElement && "disabled" in el) {
      (el as HTMLButtonElement).disabled = busy;
    }
  }
}

/** The form's named fields as a flat map — run-sheet.tsx's collector plus the multi-value case the
 *  bulk confirm's `only[]` checkboxes (and a multi-select `ed.*`) need: a repeated name becomes a
 *  `string[]`, which `bodyFields` reads as the array the document's parseBody would have produced.
 *  Read BEFORE any busy-disable pass — disabled controls contribute nothing. */
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

/**
 * The shared delegated submit leg — the dossier's two interception rules:
 *   1. a same-origin `method="get"` form (the Desk's `data-findings-filters` bar) becomes an
 *      in-router nav to the `action?fields` URL the native submit would have built;
 *   2. a `method="post"` form whose action names a `wantsJson` dossier write path becomes the
 *      JSON envelope call.
 * Everything else — off-origin, non-`/p/`, a component that already handled the submit
 * (`defaultPrevented`), the Showcase duplicate, steering POSTs — keeps its native leg.
 */
export function dossierSubmitHandler(opts: {
  readonly router: ReturnType<typeof useRouter>;
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
    const method = (form.getAttribute("method") ?? "get").toLowerCase();
    if (method === "get") {
      e.preventDefault();
      const fields = collectJsonFields(form);
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(fields)) {
        for (const value of Array.isArray(v) ? v : [v]) {
          if (value !== "") q.append(k, value);
        }
      }
      const qs = q.toString();
      void opts.router.navigate({ href: qs === "" ? actionAttr : `${actionAttr}?${qs}` });
      return;
    }
    if (method !== "post") return;
    const path = actionPath(actionAttr);
    if (path == null || !DOSSIER_WRITE.test(path)) return;
    e.preventDefault();
    if (form.getAttribute("aria-busy") === "true") return;
    const json = collectJsonFields(form);
    // A clicked submitter's name/value rides the post (the disposition verb button's `verb=accept`,
    // the gate card's `action=approve`) — the native submit semantics the collector can't see.
    const submitter = (e.nativeEvent as Partial<SubmitEvent>).submitter;
    if (submitter instanceof HTMLElement) {
      const n = submitter.getAttribute("name");
      if (n != null && n !== "") json[n] = submitter.getAttribute("value") ?? "on";
    }
    opts.write({ form, action: path, json });
  };
}

/** One dossier write — mutation + busy settle + the `{ok,redirect}`/`{error}` envelope read. */
function useDossierWrite() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mutError, setMutError] = useState<{ findingId: string; message: string } | null>(null);
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
        // The allowlist-validated external hand-off — a real document navigation, never in-router.
        navigateDocument(env.url);
        return;
      }
      if (env.redirect != null) {
        // The 302's identical twin — `?disposed=`/`?applied=`/`?bulkdone=` land as validated
        // search on the same route; the twin refetches the changed server truth.
        void router.navigate({ href: env.redirect });
        return;
      }
    },
    onError: (err, vars) => {
      // The SSR's `?ferr=<fid>&fmsg=<msg>` arm verbatim: the notice line carries the api's stable
      // detail/code (never a client literal); the card's under-form error shows when the refused
      // write named a finding (bulk/gate misses land the notice alone — `ferr=bulk` parity).
      const fid = /\/findings\/([^/]+)\//.exec(vars.action)?.[1] ?? "";
      const message =
        err instanceof BffError ? (err.detail ?? err.code) : COPY.spaError.body;
      setMutError({ findingId: fid, message });
    },
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      void queryClient.invalidateQueries({ queryKey: ["bff"] });
    },
  });
  return { mutation, mutError, write: mutation.mutate, router };
}

/** A pane body wrapper — intercepts the dossier write forms the Margin/Desk bodies carry (the
 *  chrome owns their containers, so the delegated handler rides the body itself) + marks the
 *  pane `aria-busy` while a write is in flight (REQ-UX-16). */
function PaneIntercept({
  busy,
  onSubmit,
  children,
}: {
  readonly busy: boolean;
  readonly onSubmit: (e: SyntheticEvent) => void;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div aria-busy={busy || undefined} onSubmit={onSubmit}>
      {children}
    </div>
  );
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
  const { mutation, mutError, write, router } = useDossierWrite();
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
    () => dossierSubmitHandler({ router, write }),
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

  const busy = mutation.isPending;
  const extras = useMemo<IdeChromeData>(
    () => ({
      // The ticks echo the SHARED filtered list (the SSR handler's `comp.filteredRows` overlay).
      findings: visible.map((f) => ({ id: f.id, severity: f.severity, kind: f.kind, excerpt: f.title })),
      ...(panes.marginBody != null
        ? { marginBody: <PaneIntercept busy={busy} onSubmit={onSubmit}>{panes.marginBody}</PaneIntercept> }
        : {}),
      ...(panes.deskFindingsBody != null
        ? { deskFindingsBody: <PaneIntercept busy={busy} onSubmit={onSubmit}>{panes.deskFindingsBody}</PaneIntercept> }
        : {}),
      ...(data.ide.chat != null
        ? { chatBody: <PaneIntercept busy={busy} onSubmit={onSubmit}>{chatPanel(data.ide.chat, slug, data.ide, compact)}</PaneIntercept> }
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
          aria-label={COPY.ide.desk.heading}
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

function obligationFooter(): ReactNode {
  return <span>{COPY.footer}</span>;
}

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
      <Shell brand={COPY.brand} nav={<a href={`/p/${slug}`}>{sheet.projectTitle}</a>} footer={obligationFooter()}>
        <PageTitle>{COPY.obligation.heading}</PageTitle>
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
      </Shell>
    </div>
  );
}
