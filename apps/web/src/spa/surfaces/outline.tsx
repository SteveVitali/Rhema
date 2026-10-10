// SPA.18 — the `outline` surface (design/22 §2 `p.outline`/`p.outlinePromote`; design/29 §route-map;
// REQ-SEQ-6/9, REQ-BFF-11). Ports pages.tsx `OutlinePage` + `OutlinePromotePage` verbatim — the same
// `<PageTitle>` h1, the same `data-outline-*`/`data-promotion-*`/`ed.*` vocabulary, the same
// phone-width `editable:false` read-only arm — on data read through `GET /bff/p/:slug/outline[/…]`.
//
//   • The autosave island (`client/outline.ts`) becomes a React leg: `ed.*` input events debounce
//     800 ms into the SAME `POST /p/:slug/outline` — now carrying the flat `ed.*` field map as JSON
//     (`bodyFields` decodes the identical grammar; the answer stays the patch result verbatim).
//     `data-autosave-status` rides the form's `data-label-{saving,saved,failed}` copy leaves,
//     with the retired island's inflight/again coalescing preserved one-for-one (SPA.26 — the SSR
//     fallback drops `data-autosave`/`data-label-*`: they were the island's mount contract; this
//     leaf emits them as its own autosave vocabulary).
//   • The delete form + the promote sheet ride the JSON `wantsJson` branches (`{ok,redirect}` /
//     `{error}` envelopes): the cited-outline 409 navigates in-router to the identical
//     `?notice=cited` flash URL the form 302 would carry — flashes stay URL-owned, never payload.
//   • A BffError refusal repaints from the invalidated twin (server truth), like the SSR reload.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { OutlineSections, PageTitle, Shell } from "@rhema/ui";
import { COPY } from "../../copy.js";
import { outlineLabels } from "../../gate-card.js";
import { BffError, bffFetch } from "../bff.js";
import type { BffOutlinePromoteTwin, BffOutlineTwin } from "../queries.js";

// Destructure the COPY branches once — the REQ-SAFE-10 leaf scan keys on `COPY.<path>` literals.
const { outlinePage: O, promote: P } = COPY;

function footer(): ReactNode {
  return <span>{COPY.footer}</span>;
}

/** Replace `{key}` placeholders in a copy template with string/number values. */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** The dual-mode mutation envelope's narrow read (`{ok, redirect?, …}`; a patch result rides `data`
 *  or the raw `{ok:true, versionIds…}` shape — the save leg treats any 2xx as success). */
interface MutationReply {
  readonly ok?: boolean;
  readonly redirect?: string;
  readonly url?: string;
}

/** REQ-UX-16's in-flight affordance — `aria-busy` on the form + disabled controls, restored on
 *  settle. Imperative because the inputs are uncontrolled (verbatim SSR markup). */
function setFormBusy(form: HTMLFormElement, busy: boolean): void {
  if (busy) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
  for (const el of form.querySelectorAll("button, input, select, textarea")) {
    if (el instanceof HTMLElement && "disabled" in el) {
      (el as HTMLButtonElement).disabled = busy;
    }
  }
}

/**
 * The form's named fields as a flat `{name: value}` map — the `FormData` grammar without the
 * wrapper: unchecked checkboxes/radios and disabled controls contribute nothing (a `strike`
 * checkbox posts `ed.claim.<s>.<i>.strike: "1"` only when ticked — the same record
 * `decodeGateEditFields` consumes server-side). Read BEFORE any busy-disable pass.
 */
function collectJsonFields(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of form.querySelectorAll("input, select, textarea")) {
    const name = el.getAttribute("name");
    if (name == null || name === "") continue;
    if (el instanceof HTMLInputElement) {
      if (el.disabled) continue;
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) out[name] = el.value === "" ? "on" : el.value;
        continue;
      }
      out[name] = el.value;
      continue;
    }
    if ((el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) && !el.disabled) {
      out[name] = el.value;
    }
  }
  return out;
}

type AutosaveState = "idle" | "saving" | "saved" | "failed";

export interface OutlineSurfaceProps {
  /** the `GET /bff/p/:slug/outline` twin bag (`null` ⇒ the SSR's `O.notFound` arm). */
  readonly data: BffOutlineTwin["outline"];
  /** the leaf's validated flash params (`?saved=1`/`?notice=…`) — URL state, never payload. */
  readonly saved: boolean;
  readonly notice?: string;
  /** §10.1's phone verdict — `editable` ANDs it off exactly like the document's `isPhoneRequest`. */
  readonly compact: boolean;
  /** the leaf's search fingerprint — a flash-nav remounts the uncontrolled form off server truth. */
  readonly contentKey: string;
}

/**
 * The §7.3 durable outline editor on the BFF twin. The autosave contract is `client/outline.ts`
 * verbatim: an `ed.*` input debounces 800 ms into a POST of the same field map; a second edit during
 * an in-flight save coalesces into ONE follow-up; the status line reads the `data-label-*` copy.
 * The explicit Save click posts immediately (the no-JS path's semantic), and delete's 409 answers
 * the `?notice=cited` flash through an in-router nav — never a document reload.
 */
export function OutlineSurface({ data, saved, notice, compact, contentKey }: OutlineSurfaceProps): ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [autosave, setAutosave] = useState<AutosaveState>("idle");
  const autosaveCtl = useRef<{ timer?: ReturnType<typeof setTimeout>; inflight: boolean; again: boolean }>({
    inflight: false,
    again: false,
  });

  const saveMutation = useMutation<MutationReply, unknown, { form: HTMLFormElement; action: string }>({
    mutationFn: async ({ action, form }) => {
      return bffFetch<MutationReply>(action, { method: "POST", json: collectJsonFields(form) });
    },
  });

  const deleteMutation = useMutation<MutationReply, unknown, { form: HTMLFormElement; action: string }>({
    mutationFn: async ({ action }) => {
      return bffFetch<MutationReply>(action, { method: "POST", json: {} });
    },
    onMutate: ({ form }) => setFormBusy(form, true),
    onSuccess: (env) => {
      if (env.redirect != null) void router.navigate({ href: env.redirect });
    },
    onError: (err, vars) => {
      // The cited-outline refusal (§7.3): the identical flash URL the form's 302 carried.
      if (err instanceof BffError && err.status === 409 && data != null) {
        void router.navigate({ href: `/p/${data.slug}/outline?notice=cited` });
      }
      void vars;
    },
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      void queryClient.invalidateQueries({ queryKey: ["bff"] });
    },
  });

  const postSave = (form: HTMLFormElement) => {
    const st = autosaveCtl.current;
    if (st.inflight) {
      st.again = true; // edits landed mid-flight — coalesce into one follow-up save
      return;
    }
    st.inflight = true;
    setAutosave("saving");
    const action = form.getAttribute("action") ?? "";
    saveMutation.mutate(
      { form, action },
      {
        onSuccess: () => {
          setAutosave("saved");
          if (data != null) {
            void queryClient.invalidateQueries({ queryKey: ["bff", "p", data.slug, "outline"] });
          }
        },
        onError: () => setAutosave("failed"),
        onSettled: () => {
          st.inflight = false;
          if (st.again) {
            st.again = false;
            schedule(0);
          }
        },
      },
    );
  };

  const schedule = (ms: number = 800) => {
    const st = autosaveCtl.current;
    clearTimeout(st.timer);
    st.timer = setTimeout(() => {
      const form = formRef.current;
      if (form) postSave(form);
    }, ms);
  };

  useEffect(() => {
    const st = autosaveCtl.current;
    return () => clearTimeout(st.timer);
  }, []);

  const onInput = (e: FormEvent<HTMLFormElement>) => {
    const el = e.target;
    if (el instanceof HTMLInputElement && el.name.startsWith("ed.")) schedule();
  };

  const onSubmit = (e: FormEvent<HTMLElement>) => {
    e.preventDefault();
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.getAttribute("aria-busy") === "true") return;
    const action = form.getAttribute("action") ?? "";
    if (data != null && action === data.deleteAction) {
      deleteMutation.mutate({ form, action });
      return;
    }
    // the autosave form's explicit Save — the debounced path, fired now.
    const st = autosaveCtl.current;
    clearTimeout(st.timer);
    postSave(form);
  };

  if (!data) {
    return (
      <div data-spa-surface>
        <Shell brand={COPY.brand} footer={footer()}>
          <PageTitle>{O.heading}</PageTitle>
          <p style={{ color: "var(--shell-fg-muted)" }}>{O.notFound}</p>
        </Shell>
      </div>
    );
  }
  const editable = data.editable && compact !== true;
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{O.heading}</PageTitle>
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0" }}>
          <a href={`/p/${data.slug}`} style={{ color: "var(--accent)" }}>{O.backToProject}</a>
          {data.draftEstimateCredits != null ? (
            <span data-draft-estimate="true" style={{ marginLeft: "12px" }}>
              {fmt(O.draftEstimateFmt, { n: data.draftEstimateCredits.toLocaleString("en-US") })}
            </span>
          ) : null}
          {saved ? (
            <span data-saved-note="true" style={{ marginLeft: "12px", color: "var(--sev-ok, var(--shell-fg-muted))" }}>{O.savedNote}</span>
          ) : null}
          {notice ? (
            <span data-notice="true" style={{ marginLeft: "12px", color: "var(--sev-major)" }}>{notice}</span>
          ) : null}
        </p>
        <form
          key={contentKey}
          ref={formRef}
          method="post"
          action={data.saveAction}
          data-outline-editor="true"
          data-autosave="true"
          data-label-saving={O.savingNote}
          data-label-saved={O.savedNote}
          data-label-failed={O.saveFailedNote}
          onInput={editable ? onInput : undefined}
        >
          <OutlineSections outline={data.outline} editable={editable} labels={outlineLabels} />
          {editable ? (
            <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
              <button type="submit" style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 500 }}>
                {O.saveLabel}
              </button>
              <span data-autosave-status="true" style={{ marginLeft: "12px", fontSize: "12px", color: "var(--shell-fg-muted)", alignSelf: "center" }}>
                {autosave === "saving" ? O.savingNote : autosave === "saved" ? O.savedNote : autosave === "failed" ? O.saveFailedNote : ""}
              </span>
            </div>
          ) : null}
        </form>
        {editable && !data.cited ? (
          <form method="post" action={data.deleteAction} style={{ marginTop: "16px" }}>
            <button type="submit" data-outline-delete="true" style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--sev-major)", background: "transparent", color: "var(--sev-major)", fontSize: "12px" }}>
              {O.deleteLabel}
            </button>
          </form>
        ) : null}
        {data.cited ? (
          <p data-cited-note="true" style={{ marginTop: "16px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>{O.citedNote}</p>
        ) : null}
      </Shell>
    </div>
  );
}

export interface OutlinePromoteSurfaceProps {
  /** the `GET /bff/p/:slug/outline/promote` twin bag (`null` ⇒ the SSR's `P.notFound` arm). */
  readonly data: BffOutlinePromoteTwin["outlinePromotion"];
}

/**
 * The §7.3 promotion sheet on the BFF twin — the api's verbatim facts (scope, source roster, URL
 * set, estimate + cap) and the Promote click that creates the run. The form's hidden fields replay
 * the server-echoed scope/thread/turn; the POST's refusal renders the same `data-notice` arm the
 * document re-render carried.
 */
export function OutlinePromoteSurface({ data }: OutlinePromoteSurfaceProps): ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);

  const promoteMutation = useMutation<
    MutationReply,
    unknown,
    { form: HTMLFormElement; action: string; json: Record<string, string> }
  >({
    mutationFn: async ({ action, json }) => {
      return bffFetch<MutationReply>(action, { method: "POST", json });
    },
    onMutate: ({ form }) => setFormBusy(form, true),
    onSuccess: (env) => {
      if (env.redirect != null) void router.navigate({ href: env.redirect });
    },
    onError: () => setNotice(P.notFound),
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      void queryClient.invalidateQueries({ queryKey: ["bff"] });
    },
  });

  const onSubmit = (e: FormEvent<HTMLElement>) => {
    e.preventDefault();
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.getAttribute("aria-busy") === "true") return;
    const action = form.getAttribute("action") ?? "";
    promoteMutation.mutate({ form, action, json: collectJsonFields(form) });
  };

  if (!data) {
    return (
      <div data-spa-surface>
        <Shell brand={COPY.brand} footer={footer()}>
          <PageTitle>{P.heading}</PageTitle>
          <p style={{ color: "var(--shell-fg-muted)" }}>{P.notFound}</p>
        </Shell>
      </div>
    );
  }
  const { promotion: f } = data;
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <Shell brand={COPY.brand} footer={footer()}>
        <PageTitle>{P.heading}</PageTitle>
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "8px 0" }}>
          <a href={`/p/${data.slug}`} style={{ color: "var(--accent)" }}>{P.backToProject}</a>
        </p>
        {data.started ? (
          <p data-started="true" style={{ fontSize: "13px", color: "var(--shell-fg)" }}>{P.startedFmt}</p>
        ) : (
          <form method="post" action={`/p/${data.slug}/outline/promote`} style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "520px" }}>
            <input type="hidden" name="scope" defaultValue={data.scope} />
            {data.threadId ? <input type="hidden" name="threadId" defaultValue={data.threadId} /> : null}
            {data.turnId ? <input type="hidden" name="turnId" defaultValue={data.turnId} /> : null}
            <p style={{ margin: 0, fontSize: "13px", color: "var(--shell-fg)" }}>
              {P.scopeLabel[data.scope] ?? data.scope}
            </p>
            <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "var(--shell-fg-muted)", display: "flex", flexDirection: "column", gap: "4px" }}>
              <li data-promotion-sources="true">{fmt(P.sourcesFmt, { n: String(f.sources) })}</li>
              <li data-promotion-urls="true">{fmt(P.urlsFmt, { n: String(f.urls.length) })}</li>
              <li data-promotion-estimate="true">{fmt(P.estimateFmt, { estimate: f.estimateCredits.toLocaleString("en-US"), cap: f.capCredits.toLocaleString("en-US") })}</li>
            </ul>
            {f.existing ? <p data-existing="true" style={{ margin: 0, fontSize: "12px", color: "var(--shell-fg-faint)" }}>{P.existingNote}</p> : null}
            <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
              {P.slugLabel}
              <input type="text" name="slug" defaultValue={f.slug} pattern="[a-z0-9][a-z0-9-]{0,47}" title={P.slugHint} style={{ display: "block", marginTop: "3px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "13px" }} />
            </label>
            {(notice ?? null) != null ? (
              <p data-notice="true" style={{ margin: 0, fontSize: "12px", color: "var(--sev-major)" }}>{notice}</p>
            ) : null}
            <div>
              <button type="submit" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600 }}>
                {P.promoteLabel}
              </button>
            </div>
          </form>
        )}
      </Shell>
    </div>
  );
}
