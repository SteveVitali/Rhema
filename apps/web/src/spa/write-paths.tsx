// R7RELOAD.1 (REQ-RELOAD-2; UXC-2) — THE shared write-path allowlist and delegated-submit
// machinery. One grammar covers every same-origin form POST a control inside the IDE chrome OR
// a `data-spa-surface` leaf can issue; the per-surface `DOSSIER_WRITE`/`EDITOR_WRITE`/
// `RUN_REPORT_WRITE` regexes are retired — surfaces import this module, and the IdeChrome host
// mounts ONE delegated `onSubmit` that covers every pane body (Timeline, panel, margin, Desk)
// as well as the leaf subtree itself. A form whose action is outside the allowlist keeps its
// native leg (the strangler's document nav still answers it); the chat forms are deliberately
// NOT in the grammar — 232 replaces them with a fetch mutation (REQ-RELOAD-1).
//
// The grammar is a UNION of the former surface grammars plus the two pane-body write paths the
// surface handlers could never see (the gate card's decide POST lives under `gates/<gid>` on
// every surface's timeline; the explainer dismiss under `explainers/<name>/dismiss`; the run
// card's steering posts under `r/<runId>/pause|resume|stop|cancel|note`):
//
//   dossier:  review/<r>/findings/<f>/(disposition|apply|promote|obligations)
//             findings/<f>/(disposition|apply|promote|obligations)
//             review/<r>/findings/bulk(-preview)   gates/<g>   obligations
//   editor:   edit/<d>/(note|cancel-run|revise)    v/<v>/restore/<rp>
//             v/<n>/diff/<m>/hunks/<h>/comments    revisions/<c>/hunks/<h>/comments
//             rename   approval-overrides   voice  voice/adopt  voice/fork
//             gates/<g>   decisions/<d>
//   run-report: r/<run>/refund
//   pane-only: explainers/<name>/dismiss   r/<run>/(pause|resume|stop|cancel|note)
//
// A census test (`write-paths.test.ts`) fails if any surface re-declares its own `*_WRITE`.

import type { FormEvent, SyntheticEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { COPY } from "../copy.js";
import { BffError, bffFetch } from "./bff.js";
import { navigateDocument } from "./dom.js";

/**
 * The shared write-path allowlist (REQ-RELOAD-2). Every path here has a `wantsJson` branch
 * server-side answering `mutationOutcome` — a JSON POST is never answered with a 302 the
 * caller can't follow, and a no-JS form post keeps its document-nav leg.
 */
export const SPA_WRITE =
  /^\/p\/[^/]+\/(?:edit\/[^/]+\/(?:note|cancel-run|revise)|v\/[^/]+\/restore\/[^/]+|v\/[^/]+\/diff\/[^/]+\/hunks\/[^/]+\/comments|revisions\/[^/]+\/hunks\/[^/]+\/comments|review\/[^/]+\/findings\/[^/]+\/(?:disposition|apply|promote|obligations)|findings\/[^/]+\/(?:disposition|apply|promote|obligations)|review\/[^/]+\/findings\/bulk(?:-preview)?|gates\/[^/]+|decisions\/[^/]+|explainers\/[^/]+\/dismiss|obligations|rename|approval-overrides|voice|voice\/adopt|voice\/fork|r\/[^/]+\/(?:pause|resume|stop|cancel|note|refund))$/;

/** The mutation success envelope (`{ok:true, redirect?, url?}` — `url` is the allowlist hand-off). */
export interface MutationReply {
  readonly ok: true;
  readonly redirect?: string;
  readonly url?: string;
}

/** A form `action` to its same-origin pathname (null ⇒ not interceptable). */
export function actionPath(action: string): string | null {
  try {
    const u = new URL(action, "https://rhema.invalid");
    return u.origin === "https://rhema.invalid" ? u.pathname : null;
  } catch {
    return null;
  }
}

/** REQ-UX-16's in-flight affordance — `aria-busy` + disabled controls, restored on settle. */
export function setFormBusy(form: HTMLFormElement, busy: boolean): void {
  if (busy) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
  for (const el of form.querySelectorAll("button, input, select, textarea")) {
    if (el instanceof HTMLElement && "disabled" in el) {
      (el as HTMLButtonElement).disabled = busy;
    }
  }
}

/** The form's named fields as a flat map — read BEFORE any busy-disable pass (a disabled
 *  control drops out of the post — collect-first is load-bearing). A repeated name becomes a
 *  `string[]`, which `bodyFields` reads as the array the document's parseBody would have
 *  produced (the bulk confirm's `only[]` checkboxes, a multi-select `ed.*`). */
export function collectJsonFields(form: HTMLFormElement): Record<string, string | string[]> {
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

export interface PaneWriteVars {
  readonly form: HTMLFormElement;
  readonly action: string;
  readonly json: Record<string, string | string[]>;
}

/**
 * The ONE delegated submit leg (REQ-RELOAD-2). Mounted at the IdeChrome host it covers every
 * pane body AND the leaf subtree — a surface's own `onSubmit` (nearer the form) claims its
 * submits first with `preventDefault`, and the host's handler skips `defaultPrevented` events,
 * so the two legs never double-post. The interception rules:
 *   1. a same-origin `method="get"` form under `/p/` becomes an in-router nav to the
 *      `action?fields` URL the native submit would have built (the URL is the state);
 *   2. a `method="post"` form whose action names an `SPA_WRITE` path becomes the JSON
 *      envelope call — scroll position and focus are preserved (REQ-UX-4: no document
 *      teardown happens at all);
 *   3. everything else — off-origin, non-`/p/`, `data-spa-native`-marked, an action outside
 *      the allowlist (chat forms, the export download POST, `/logout`) — keeps its native leg.
 */
export function delegatedSubmitHandler(opts: {
  readonly router: Pick<ReturnType<typeof useRouter>, "navigate">;
  readonly write: (vars: PaneWriteVars) => void;
}): (e: SyntheticEvent) => void {
  return (e) => {
    if (e.defaultPrevented) return;
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.hasAttribute("data-spa-native")) return;
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
    if (path == null || !SPA_WRITE.test(path)) return;
    e.preventDefault();
    if (form.getAttribute("aria-busy") === "true") return;
    const json = collectJsonFields(form);
    // A clicked submitter's name/value rides the post (the disposition verb button's
    // `verb=accept`, the gate card's `action=approve`) — the native submit semantics the
    // collector can't see.
    const submitter = (e.nativeEvent as Partial<SubmitEvent>).submitter;
    if (submitter instanceof HTMLElement) {
      const n = submitter.getAttribute("name");
      if (n != null && n !== "") json[n] = submitter.getAttribute("value") ?? "on";
    }
    opts.write({ form, action: path, json });
  };
}

/**
 * One write against the shared grammar — the mutation + busy settle + the `{ok,redirect}`/
 * `{error}` envelope read. `onError` receives the BffError (or a generic fallback message)
 * so a surface can keep its own error rendering; the default arm (the chrome host's pane
 * writes) treats a stale-state refusal (400/403/404/409) like the editor's SSR re-render:
 * the `onSettled` invalidate re-reads the twin and the post-decision page is the answer.
 */
export function usePaneWrite(opts?: {
  readonly onError?: (err: BffError | Error, vars: PaneWriteVars) => void;
}): {
  readonly pending: boolean;
  readonly write: (vars: PaneWriteVars) => void;
} {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutation = useMutation<MutationReply, unknown, PaneWriteVars>({
    mutationFn: async ({ action, json }) => {
      return bffFetch<MutationReply>(action, { method: "POST", json });
    },
    onMutate: ({ form }) => {
      setFormBusy(form, true);
    },
    onSuccess: (env) => {
      if (env.url != null) {
        // The allowlist-validated external hand-off — a real document navigation.
        navigateDocument(env.url);
        return;
      }
      if (env.redirect != null) {
        // The 302's identical twin — the flash-parameterized URL lands the fresh twin read.
        // Off-route hrefs degrade to the document nav, which still answers them.
        try {
          void router.navigate({ href: env.redirect });
        } catch {
          navigateDocument(env.redirect);
        }
        return;
      }
    },
    onError: (err, vars) => {
      if (opts?.onError != null) {
        opts.onError(err instanceof BffError ? err : new Error(COPY.spaError.body), vars);
        return;
      }
      // Default (chrome-host) arm: a stale-state refusal is the SSR's silent re-render — the
      // invalidate below re-reads the twin and the post-decision state is the answer.
      return;
    },
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      // R7SYNC.1 (REQ-SPEED-3) — scoped invalidation: the write's `/p/:slug/…` action names
      // its project subtree; workspace-scoped actions (settings/voices) keep `["bff","app"]`
      // — never the bare `["bff"]` every-twin flush the audit flagged.
      const slug = /^\/p\/([^/]+)\//.exec(vars.action)?.[1];
      void queryClient.invalidateQueries({ queryKey: slug != null ? ["bff", "p", slug] : ["bff", "app"] });
    },
  });
  return { pending: mutation.isPending, write: mutation.mutate };
}

/** A pane body wrapper — marks the pane `aria-busy` while a write is in flight (REQ-UX-16). */
export function PaneBusy({
  busy,
  children,
}: {
  readonly busy: boolean;
  readonly children: React.ReactNode;
}): React.ReactNode {
  return <div aria-busy={busy || undefined}>{children}</div>;
}

/** The `FormEvent` import keeps TSX call-sites terse — re-exported for the surfaces. */
export type { FormEvent, SyntheticEvent };
