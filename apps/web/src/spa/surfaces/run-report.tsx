// SPA.22 — the `run-report` surface leaf (design/22 §2 `p.runReport` row; design/25's
// `p.runReport` is IDE-framed — REQ-SEQ-12's `run-report` × `ide-chrome` AND-gate).
// REQ-BFF-1..11, REQ-SEQ-6, REQ-UX-15/16, REQ-VFY-4.
//
//   • The body is `RunReportPage`'s own markup verbatim — the shared `<RunReport>` article
//     (Level-3 + the `?advanced=1` Level-4 disclosure, identical `advancedHref`) plus the §14.4
//     refund arms and the rate-table line — so the dom-contract's run-report vocabulary is
//     attribute-for-attribute identical across renderers (the dossier.tsx precedent).
//   • THE KEY PORT — the live meter (REQ-UX-15): the twin's `ide.feed` slice (the `/p/:slug`
//     reader's replayed rows + `lastSeq` + the same-origin `eventsUrl`, verbatim) publishes
//     through `useShellChrome`, so `IdeChrome`'s `useIdeFeed` binds the ONE EventSource with
//     `?after=`/`Last-Event-ID` resume — `usage.tick`/`cost.final`/`step.*` patch the Timeline
//     card's `[data-credits]`/`[data-phase-status]` live and non-tick events schedule the
//     debounced `["bff"]` invalidation that converges this report's phase bars/differences.
//     `usage.tick` is exempt from invalidation (REQ-UX-15's no-refetch-storm rule, verbatim).
//   • The surface's own write (the §14.4 refund POST) is the SAME document path re-issued as
//     JSON (design/22 §3 — the DOM contract is the wire contract): the delegated submit
//     collects the field map BEFORE the busy-disable, posts `{json}` through `bffFetch`, and
//     lands `{ok,redirect}` via `router.navigate` — the `…#report` URL is the 302's identical
//     twin. A refusal's preserved status (400/403/404/409 — window closed/decided) is the
//     SSR's silent stale→re-render arm: the leaf invalidates and the fresh twin carries the
//     post-decision block, no notice invented (design/22 §3's stale-state note).
//   • Forms that are NOT this surface's write (the §6.5 steering POSTs on the Timeline's run
//     cards — chrome-owned, outside the leaf's subtree; the Showcase banner's duplicate; the
//     chat panel's self-intercepted submits) stay native — the document nav still answers them,
//     and their `wantsJson` branches server-side keep the envelope for any JSON caller
//     (the dossier.tsx precedent).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode, type SyntheticEvent } from "react";
import type { TimelineRun } from "@rhema/findings-core";
import { RunReport } from "@rhema/ui";
import { COPY } from "../../copy.js";
import { chatPanel } from "../../chat-pane.js";
import { reportLabels, runCardLabels, timelineHrefs, timelineLabels } from "../../dossier-view.js";
import { BffError, bffFetch } from "../bff.js";
import { navigateDocument } from "../dom.js";
import { useReadOnlyProject, readOnlyReasonText, ReadOnlyNotice } from "../read-only.js";
import { useDwell } from "../dwell.js";
import type { IdeChromeData } from "../ide/chrome-data.js";
import { useShellChrome } from "../ide/chrome-data.js";
import { PageHeader } from "../page-header.js";
import type { BffRunReportTwin } from "../queries.js";
import { TimelineGateCard } from "./dossier.js";

/** pages.tsx `fmt` verbatim — `{key}` placeholders in a copy template. */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** The mutation success envelope (`{ok:true, redirect?, url?}` — `url` is the allowlist hand-off). */
interface MutationReply {
  readonly ok: true;
  readonly redirect?: string;
  readonly url?: string;
}

/**
 * The run-report surface's JSON write path — the §14.4 refund form is the only write control the
 * leaf renders (it carries a `wantsJson` branch server-side, SPA.22). Anything outside this
 * grammar — the §6.5 steering verbs living on chrome-owned run cards included — stays a native
 * form post (the strangler's document nav still answers it).
 */
const RUN_REPORT_WRITE = /^\/p\/[^/]+\/r\/[^/]+\/refund$/;

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
 *  (the dossier.tsx/run-sheet.tsx precedent — imperative because the field map stays form-native). */
function setFormBusy(form: HTMLFormElement, busy: boolean): void {
  if (busy) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
  for (const el of form.querySelectorAll("button, input, select, textarea")) {
    if (el instanceof HTMLElement && "disabled" in el) {
      (el as HTMLButtonElement).disabled = busy;
    }
  }
}

/** The form's named fields as a flat map — dossier.tsx's collector verbatim. Read BEFORE any
 *  busy-disable pass — disabled controls contribute nothing. */
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

/** The delegated submit leg — the one interception rule: a `method="post"` form whose action
 *  names the refund write path becomes the JSON envelope call; everything else keeps its
 *  native leg (off-origin, non-`/p/`, `defaultPrevented`, the steering/chat submits). */
function runReportSubmitHandler(opts: {
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
    if (path == null || !RUN_REPORT_WRITE.test(path)) return;
    e.preventDefault();
    if (form.getAttribute("aria-busy") === "true") return;
    const json = collectJsonFields(form);
    // A clicked submitter's name/value rides the post — the native submit semantics the
    // collector can't see (the refund button is unnamed today; kept for grammar parity).
    const submitter = (e.nativeEvent as Partial<SubmitEvent>).submitter;
    if (submitter instanceof HTMLElement) {
      const n = submitter.getAttribute("name");
      if (n != null && n !== "") json[n] = submitter.getAttribute("value") ?? "on";
    }
    opts.write({ form, action: path, json });
  };
}

/** One run-report write — mutation + busy settle + the `{ok,redirect}`/`{error}` envelope read. */
function useRunReportWrite() {
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
        // The allowlist-validated external hand-off — a real document navigation, never in-router.
        navigateDocument(env.url);
        return;
      }
      if (env.redirect != null) {
        // The 302's identical twin — `…/r/:runId#report` lands the fresh twin read + the fragment.
        void router.navigate({ href: env.redirect });
        return;
      }
    },
    onError: (err) => {
      // Stale-state writes (design/22 §3): a refused refund — window closed/already decided
      // (400/403/404/409) — is the SSR's silent re-render: `onSettled`'s invalidate re-reads the
      // twin and the post-decision block is the answer. Only a real fault lands the alert line.
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

export interface RunReportSurfaceProps {
  /** the `GET /bff/p/:slug/r/:runId` aggregate twin. */
  readonly data: BffRunReportTwin;
  /** §10.1's phone verdict — boot-owned `deviceClass`, never the twin's. */
  readonly compact: boolean;
}

export function RunReportSurface({ data, compact }: RunReportSurfaceProps): ReactNode {
  const { mutation, mutError, write } = useRunReportWrite();
  const runReport = data.runReport;
  const slug = runReport.slug;
  // R7RO.1 (REQ-DWEB-14) — the read-only fact (the twin's carrier, else the boot slot); the
  // §14.4 refund write and the chrome's gate/chat writes withhold under demo/showcase
  // (`run_lock` is run-lifecycle — its own arms stay live).
  const ro = useReadOnlyProject(data);
  const roTip = ro != null && ro.reason !== "run_lock" ? readOnlyReasonText(ro.reason) : null;

  // REQ-BETA-10 — the SSR document's `dwellSurface:"report"` heartbeat (the hook twin).
  useDwell("report");

  const onSubmit = useMemo(() => runReportSubmitHandler({ write }), [write]);
  const busy = mutation.isPending;

  // The chrome slice — the SSR IdeFrame's pane extras verbatim: the Timeline's label/href maps +
  // the waiting run's identical §6.4 gate card (presence via the hook twin), and the Desk's chat
  // body when the seam delivered one.
  const extras = useMemo<IdeChromeData>(
    () => ({
      ...(data.ide.timelineView != null
        ? {
            timelineLabels,
            timelineCardLabels: runCardLabels,
            timelineHrefs: timelineHrefs(slug),
            renderGateCard: (run: TimelineRun) => (
              <TimelineGateCard run={run} slug={slug} compact={compact} readOnlyTitle={roTip} />
            ),
          }
        : {}),
      ...(data.ide.chat != null
        ? { chatBody: chatPanel(data.ide.chat, slug, data.ide, compact, roTip) }
        : {}),
    }),
    [data.ide, slug, compact, roTip],
  );
  useShellChrome(data, extras);

  return (
    <div data-spa-surface onSubmit={onSubmit} aria-busy={busy || undefined}>
      {ro != null ? <ReadOnlyNotice reason={ro.reason} slug={slug} /> : null}
      {/* R7SHELL.1b — the title row carries the Project › Surface crumb (REQ-SHELL-3/5). */}
      <PageHeader
        title={COPY.report.heading}
        crumbs={[{ label: runReport.slug, href: `/p/${slug}` }, { label: COPY.report.heading }]}
      />
      <div style={{ margin: "16px 0" }}>
        <RunReport
          view={runReport.report.report}
          {...(runReport.report.advancedView ? { advanced: runReport.report.advancedView } : {})}
          labels={reportLabels}
          advancedHref={`/p/${runReport.slug}/r/${runReport.runId}?advanced=1`}
        />
      </div>
      {/* DEF.4 — the §14.4 refund-window affordance (REQ-SPEC-24(6)), verbatim from RunReportPage:
          rendered ONLY while the api's `refundWindow` block is present — the flag admitting
          nothing ⇒ no control at all. The form posts through the leaf's JSON leg. */}
      {runReport.report.refundWindow?.state === "eligible" && roTip == null ? (
        <form method="post" action={`/p/${runReport.slug}/r/${runReport.runId}/refund`} data-refund-form="true" style={{ margin: "0 0 12px" }}>
          <button
            type="submit"
            data-refund-cta="true"
            style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "4px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", cursor: "pointer" }}
          >
            {fmt(COPY.report.refundCtaFmt, { n: runReport.report.refundWindow.credits.toLocaleString("en-US") })}
          </button>
          <span style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginLeft: "8px" }}>{COPY.report.refundNote}</span>
        </form>
      ) : null}
      {runReport.report.refundWindow?.state === "eligible" && roTip != null ? (
        // R7RO.1 — the withheld refund control (disabled + reason tooltip, before any request).
        <button type="button" data-refund-cta="true" disabled title={roTip} style={{ margin: "0 0 12px" }}>
          {fmt(COPY.report.refundCtaFmt, { n: runReport.report.refundWindow.credits.toLocaleString("en-US") })}
        </button>
      ) : null}
      {runReport.report.refundWindow?.state === "refunded" ? (
        <p data-refund-state="refunded" style={{ fontSize: "12px", color: "var(--state-ready)", margin: "0 0 12px" }}>
          {fmt(COPY.report.refundedFmt, { n: runReport.report.refundWindow.credits.toLocaleString("en-US") })}
        </p>
      ) : null}
      {runReport.report.refundWindow?.state === "pending_review" ? (
        <p data-refund-state="pending_review" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 12px" }}>
          {fmt(COPY.report.refundReviewFmt, { n: runReport.report.refundWindow.credits.toLocaleString("en-US") })}
        </p>
      ) : null}
      {runReport.report.refundWindow?.state === "denied" ? (
        <p data-refund-state="denied" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 12px" }}>
          {COPY.report.refundDenied}
        </p>
      ) : null}
      {/* REQ-BILL-19 (P1.16) — the report links its frozen rate-table version to the published tables. */}
      {runReport.report.report.rateTableVersion != null ? (
        <p data-rate-table-link="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "0 0 12px" }}>
          {fmt(COPY.report.rateTableFmt, { v: String(runReport.report.report.rateTableVersion) })}{" "}
          <a href="/pricing/rates">{COPY.report.rateTableLink}</a>
        </p>
      ) : null}
      {mutError != null ? (
        <p role="alert" style={{ fontSize: "12px", color: "var(--sev-major)", margin: "0 0 12px" }}>
          {mutError}
        </p>
      ) : null}
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
