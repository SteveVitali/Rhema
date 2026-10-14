// SPA.13 — the `voices` surface's React twins (REQ-SEQ-9, REQ-BFF-1/2/9/16, REQ-DAT-4, REQ-TST-2,
// REQ-VFY-2/6; design/22 §2 voices/voicesNew/voiceDetail/p.voiceReseed rows). `VoicesSurface`,
// `VoiceNewSurface`, `VoiceDetailSurface`, and `VoiceReseedSurface` port pages.tsx `VoicesPage` /
// `VoiceNewPage` / `VoiceDetailPage` / `VoiceReseedPage` verbatim — the same `<Shell>`/`<PageTitle>`
// chrome, the same tab bar, the same `data-*` vocabulary — on data read through the `voices*Query`
// twins instead of `usePageData()`. Every hook literal resolves to dom-contract.ts; nothing
// unmanifested is invented.
//
// Port notes (the places a React mount CANNOT be a byte-copy):
//   • forms keep their SSR markup verbatim (`method="post"`, the action path, the field
//     vocabulary — the no-JS fallback is the same element) but a delegated `onSubmit` on the
//     `data-spa-surface` wrapper intercepts every voice form: fields are collected BEFORE the
//     REQ-UX-16 busy pass (disabled controls drop out of the FormData grammar), the CLICKED
//     submitter's name/value rides with them (`intent`, `action`, `included`, `reseed` — the
//     verbs the SSR posts via the pressed button), repeated names fold to string arrays (the
//     confirm step's `known`/`include` lists — the same grammar `bodyFields` decodes), and the
//     `{ok, redirect|url}` envelope is followed exactly as settings does (`redirect` in-router so
//     the `?saved`/`?added`/… flash paints; `url` a document nav). `["bff"]` invalidates on
//     settle — server-truth repaint, never optimistic mirroring.
//   • file inputs ride REQ-BFF-16's upload leg, never a JSON field and never proxied bytes:
//     `POST /bff/import/presign` mints the v4-signed PUT, the browser PUTs the File to `url`
//     echoing `requiredHeaders` verbatim, and the JSON body carries the returned
//     `quarantineKey` — the exact triad the server's `wantsJson` branches accept. The whole
//     chain sits inside `mutationFn` so `aria-busy`/disabled cover presign + PUT + POST.
//     No file chosen ⇒ no quarantineKey, the pasted-text/URL legs carry (SSR parity).
//   • `/voices/new` refusals (`name_required`, `sample_required`, `full_required`) are the
//     document's own inline re-render (REQ-BFF-5) — a `BffError.detail` lands in the same
//     `role="alert"` slot `voiceNew.error` painted. Every other form's refusal matches the SSR
//     (the write no-ops; the settled refetch repaints truth).
//   • `?tab=` stays URL state — the tab bar's plain `<a>` hrefs re-decide the leaf through the
//     strangler exactly like the SSR document (the settings-nav precedent); the `?tab`/`?sample`
//     reads ride the detail twin's query string.
//   • `compact` is `boot.deviceClass === "phone"` — the §10.1 ✗ suppression legs are verbatim
//     (PhoneBlockedNote where the SSR emitted it; hidden controls otherwise).
//   • REQ-VFY-6 additions only where SSR markup has no programmatic name — `aria-label` on the
//     delete-confirm input, the seed textarea, and the per-item review checkboxes; no hook or
//     copy changes.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { PageTitle, Shell } from "@rhema/ui";
import type {
  PresignedImportDto,
  VoiceConnectionDto,
  VoiceConnectionsDto,
  VoiceDetailDto,
  VoiceListDto,
  VoiceListRowDto,
  VoiceSampleDetailDto,
  VoiceSampleDto,
  VoiceStatusDto,
} from "@rhema/api-client";
import { COPY } from "../../copy.js";
import { BffError, bffFetch } from "../bff.js";
import { navigateDocument } from "../dom.js";
import type { BffVoiceDetailTwin, BffVoiceReseedTwin } from "../queries.js";

const { voice: VC } = COPY;

/** `{key}`-template substitution — the local twin of pages.tsx's `fmt` (one helper, both renderers). */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

function footer(): ReactNode {
  return <span>{COPY.footer}</span>;
}

/** P1.19 — the §10.1 ✗ column's phone-width note (pages.tsx `PhoneBlockedNote` verbatim). */
function PhoneBlockedNote(): ReactNode {
  return (
    <p data-phone-blocked="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", maxWidth: "68ch" }}>
      {COPY.phoneBlocked.note}
    </p>
  );
}

// ---- The SSR's shared micro-styles, verbatim (pages.tsx) ----------------------------------------

const fieldStyle = {
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
const submitStyle = {
  width: "100%",
  padding: "9px 14px",
  borderRadius: "8px",
  border: "none",
  background: "var(--accent)",
  color: "var(--shell-bg)",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};
const textAreaStyle = {
  display: "block",
  width: "100%",
  minHeight: "160px",
  marginTop: "4px",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-bg)",
  color: "var(--shell-fg)",
  fontSize: "13px",
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  boxSizing: "border-box" as const,
};

// ---- The delegated mutation leg (one hook per surface mount) -------------------------------------

/** The `mutationOutcome` envelope the JSON branches answer (`url` = server-validated external). */
interface VoiceMutationReply {
  readonly ok: true;
  readonly redirect?: string;
  readonly url?: string;
  readonly flash?: unknown;
  readonly data?: unknown;
  readonly pending?: unknown;
}

/** One named control's contribution — the FormData grammar (string or File). */
interface FormField {
  readonly name: string;
  readonly value: string | File;
}

/**
 * `new FormData(form)`'s field grammar, collected explicitly: named controls only; unchecked
 * checkboxes/radios and disabled controls contribute nothing; file inputs contribute their first
 * File. Collected imperatively — NOT via `new FormData(form)` — because the collection must run
 * BEFORE the REQ-UX-16 disable pass: `onMutate` disables every control, and FormData skips
 * disabled controls, so reading after the busy pass would post an empty body.
 */
function collectVoiceFields(form: HTMLFormElement): FormField[] {
  const out: FormField[] = [];
  for (const el of form.querySelectorAll("input, select, textarea")) {
    const name = el.getAttribute("name");
    if (name == null || name === "") continue;
    if (el instanceof HTMLInputElement) {
      if (el.disabled) continue;
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) out.push({ name, value: el.value === "" ? "on" : el.value });
        continue;
      }
      if (el.type === "file") {
        const f = el.files?.[0];
        if (f != null && f.size > 0) out.push({ name, value: f });
        continue;
      }
      out.push({ name, value: el.value });
      continue;
    }
    if ((el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) && !el.disabled) {
      out.push({ name, value: el.value });
    }
  }
  return out;
}

/** Fold a field into the JSON body — a repeated name becomes a string array (`known`/`include`). */
function foldField(json: Record<string, string | string[]>, name: string, value: string): void {
  const prev = json[name];
  if (prev === undefined) {
    json[name] = value;
  } else if (Array.isArray(prev)) {
    prev.push(value);
  } else {
    json[name] = [prev, value];
  }
}

/** REQ-UX-16's in-flight affordance — `aria-busy` on the form + disabled controls, restored on
 *  settle. Imperative because the inputs are uncontrolled (verbatim SSR markup); no voice form
 *  ships a pre-disabled control, so settle's re-enable is unconditional. */
function setFormBusy(form: HTMLFormElement, busy: boolean): void {
  if (busy) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
  for (const el of form.querySelectorAll("button, input, select, textarea")) {
    if (el instanceof HTMLElement && "disabled" in el) {
      (el as HTMLButtonElement).disabled = busy;
    }
  }
}

/** What a submit hands the mutation — the fields (submitter included) collected BEFORE the busy
 *  pass; the presign→PUT leg runs inside `mutationFn` so the busy affordance covers it. */
interface VoiceFormPost {
  readonly form: HTMLFormElement;
  readonly action: string;
  readonly fields: readonly FormField[];
}

/**
 * The one voices-form submit handler — a delegation the `data-spa-surface` wrapper attaches so
 * every form rides the JSON branch without prop-threading. The clicked submitter's `name`/`value`
 * joins the field set (the SSR's pressed-button grammar); a `File` contribution runs the
 * presign→direct-PUT→`quarantineKey` leg (REQ-BFF-16 — the BFF mints the signature, GCS takes the
 * bytes, the JSON mutation carries only the key). `onRefusal` receives a `BffError`'s detail for
 * the surfaces whose SSR twin re-renders the refusal inline (`/voices/new`'s `voiceNew.error`).
 */
function useVoiceFormSubmit(opts?: {
  readonly onRefusal?: (detail: string) => void;
}): (e: FormEvent<HTMLElement>) => void {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutation = useMutation<VoiceMutationReply, unknown, VoiceFormPost>({
    mutationFn: async ({ action, fields }) => {
      const json: Record<string, string | string[]> = {};
      for (const f of fields) {
        if (f.value instanceof File) {
          // REQ-BFF-16 — mint → direct PUT → key. `requiredHeaders` echo verbatim (the signature
          // binds them); a refused PUT is a BffError so the busy pass still settles.
          const pre = await bffFetch<PresignedImportDto>("/bff/import/presign", { method: "POST" });
          const put = await fetch(pre.url, {
            method: "PUT",
            headers: { ...pre.requiredHeaders },
            body: f.value,
          });
          // fetch resolves on headers — draining the body closes Chromium's request entry so a
          // later document nav can't abort a response the app already accepted (live: the
          // requestfailed sweep flagged ERR_ABORTED on a PUT whose bytes had landed).
          await put.arrayBuffer().catch(() => new ArrayBuffer(0));
          if (!put.ok) throw new BffError(put.status, "upload_failed", { detail: `upload PUT ${put.status}` });
          json["quarantineKey"] = pre.key;
          continue;
        }
        foldField(json, f.name, f.value);
      }
      return bffFetch<VoiceMutationReply>(action, { method: "POST", json });
    },
    onMutate: ({ form }) => setFormBusy(form, true),
    onSuccess: (env) => {
      if (env.url != null) {
        navigateDocument(env.url);
        return;
      }
      if (env.redirect != null) {
        void router.navigate({ href: env.redirect });
      }
    },
    onError: (err) => {
      // REQ-BFF-5 — the refusal is data on the surfaces that render it; a transport failure is a
      // no-op repaint (the SSR's swallow-and-redirect parity).
      if (err instanceof BffError) opts?.onRefusal?.(err.detail ?? err.code);
    },
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      // Server-truth repaint — the twins refetch; a refused write keeps its persisted values.
      void queryClient.invalidateQueries({ queryKey: ["bff"] });
    },
  });
  return (e) => {
    e.preventDefault();
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.getAttribute("aria-busy") === "true") return;
    const action = form.getAttribute("action") ?? "";
    const fields = collectVoiceFields(form);
    // The clicked submitter's name/value — FormData grammar includes it; `collectVoiceFields`
    // can't (it walks controls, not the event). `intent`/`action`/`included`/`reseed` ride here.
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    if (
      submitter instanceof HTMLElement &&
      (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement)
    ) {
      const name = submitter.getAttribute("name");
      if (name != null && name !== "") fields.push({ name, value: submitter.value });
    }
    mutation.mutate({ form, action, fields });
  };
}

// ---- /voices — the §9.1 three-group library ------------------------------------------------------

/** The shared pill rendered from the ONE status projection (§9.3) — pages.tsx `voicePillSpan`. */
function voicePillSpan(status: VoiceStatusDto | null | undefined): ReactNode {
  if (!status) return null;
  return (
    <span data-voice-pill={status.pill.tone} style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
      {status.pill.label}
    </span>
  );
}

/** One library card (§9.1) — pages.tsx `VoiceCard` verbatim. */
function VoiceCard({ v }: { v: VoiceListRowDto }): ReactNode {
  return (
    <li key={v.personaId} data-voice-card={v.personaId} data-voice-group={v.group} style={{ border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "10px 14px" }}>
      <a href={`/v/${v.personaId}`} style={{ fontWeight: 600, fontSize: "14px" }}>
        {v.name ?? v.personaId}
      </a>
      {v.byline ? <span style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}> · {v.byline}</span> : null}
      {v.readOnly ? (
        <span data-read-only="true" style={{ color: "var(--shell-fg-faint)", fontSize: "11px", marginLeft: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {VC.card.readOnlyNote}
        </span>
      ) : null}
      {v.tier ? (
        <span data-voice-tier={v.tier} style={{ color: "var(--shell-fg-faint)", fontSize: "11px", marginLeft: "8px" }}>
          {VC.card.tierLabel[v.tier] ?? v.tier}
        </span>
      ) : null}
      {v.members.length > 0 ? (
        <div data-composed-from="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "2px" }}>
          {fmt(VC.card.composedFmt, { names: v.members.map((m) => m.name ?? m.personaId).join(", ") })}
        </div>
      ) : null}
      <div style={{ marginTop: "4px", display: "flex", gap: "12px", alignItems: "center", fontSize: "12px", color: "var(--shell-fg-faint)", flexWrap: "wrap" }}>
        {voicePillSpan(v.status)}
        <span>{fmt(VC.sampleCountFmt, { n: v.sampleCount })}</span>
        {v.sources.length > 0 ? <span data-voice-sources="true">{v.sources.join(" · ")}</span> : null}
        {v.projectCount > 0 ? <span>{fmt(VC.card.projectsFmt, { n: v.projectCount })}</span> : null}
        {v.lastBuiltAt ? (
          <span>{fmt(VC.card.lastBuiltFmt, { d: new Date(v.lastBuiltAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) })}</span>
        ) : null}
        {v.readOnly ? (
          <form method="post" action={`/v/${v.personaId}/fork`} style={{ margin: 0 }}>
            <button type="submit" data-fork-voice={v.personaId} style={{ fontSize: "12px", background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0 }}>
              {VC.card.forkCta}
            </button>
          </form>
        ) : null}
      </div>
    </li>
  );
}

/** Auth-gated: the /voices destination (§9.1) — `VoicesPage` verbatim on the `voices` twin; a
 *  degraded read is the SSR's own `listVoiceGroups` catch (`{voices:[], groups:{…empty}}` —
 *  the page's empty state, never a fabricated card). */
export function VoicesSurface({
  voices,
  compact,
}: {
  readonly voices: VoiceListDto | null;
  readonly compact: boolean;
}): ReactNode {
  const onSubmit = useVoiceFormSubmit();
  const groups = voices?.groups;
  const sections: { key: "your_voices" | "house_styles" | "shared_with_you"; heading: string; empty: string }[] = [
    { key: "your_voices", heading: VC.groups.yours, empty: VC.groups.yoursEmpty },
    { key: "house_styles", heading: VC.groups.house, empty: VC.groups.houseEmpty },
    { key: "shared_with_you", heading: VC.groups.shared, empty: VC.groups.sharedEmpty },
  ];
  const total = (voices?.voices ?? []).length;
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <Shell brand={COPY.brand} nav={<a href="/app">{COPY.project.backToList}</a>} footer={footer()}>
        <PageTitle>{VC.listHeading}</PageTitle>
        {/* P1.19 — §10.1 ✗: new voice is a building surface — never offered on phone width. */}
        {compact === true ? null : (
          <p>
            <a href="/voices/new" data-new-voice="true">{VC.newCta}</a>
          </p>
        )}
        {total === 0 ? (
          <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px" }}>{VC.listEmpty}</p>
        ) : (
          sections.map((s) => {
            const rows = groups?.[s.key] ?? [];
            return (
              <section key={s.key} data-voice-group-section={s.key} style={{ marginTop: "16px" }}>
                <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                  {s.heading}
                </h2>
                {rows.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "var(--shell-fg-faint)", margin: "4px 0" }}>{s.empty}</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
                    {rows.map((v) => (
                      <VoiceCard key={v.personaId} v={v} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </Shell>
    </div>
  );
}

// ---- /voices/new — the §9.2 creation sheet -------------------------------------------------------

/** Auth-gated: the §9.2 creation sheet — `VoiceNewPage` verbatim; a refused create's
 *  `BffError.detail` lands in `voiceNew.error`'s `role="alert"` slot (REQ-BFF-5). */
export function VoiceNewSurface({ compact }: { readonly compact: boolean }): ReactNode {
  const [refusal, setRefusal] = useState<string | null>(null);
  const onSubmit = useVoiceFormSubmit({ onRefusal: setRefusal });
  if (compact === true) {
    return (
      <div data-spa-surface>
        <Shell brand={COPY.brand} nav={<a href="/voices">{VC.detail.backToList}</a>} footer={footer()}>
          <PageTitle>{VC.new.heading}</PageTitle>
          <PhoneBlockedNote />
        </Shell>
      </div>
    );
  }
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <Shell brand={COPY.brand} nav={<a href="/voices">{VC.detail.backToList}</a>} footer={footer()}>
        <PageTitle>{VC.new.heading}</PageTitle>
        {refusal != null ? (
          <p role="alert" style={{ color: "var(--sev-major)", fontSize: "13px" }}>{refusal}</p>
        ) : null}
        <form method="post" action="/voices/new" encType="multipart/form-data" style={{ maxWidth: "68ch" }}>
          <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block" }}>
            {VC.new.nameLabel}
            <input name="name" required placeholder={VC.new.namePlaceholder} style={fieldStyle} />
          </label>
          <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "12px" }}>
            {VC.new.bylineLabel}
            <input name="byline" style={fieldStyle} />
          </label>
          <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "16px" }}>
            {VC.new.describeLabel}
            <textarea name="description" style={textAreaStyle} />
          </label>
          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>{VC.new.describeHint}</p>
          <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "16px" }}>
            {VC.new.sampleTitleLabel}
            <input name="sample_title" style={fieldStyle} />
          </label>
          <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "8px" }}>
            {VC.new.sampleLabel}
            <textarea name="sample_text" style={textAreaStyle} />
          </label>
          {/* REQ-BFF-16 — the presign→PUT leg's key carrier; it precedes the file input in DOM
              order so the collected `""` is overwritten by the minted key (an empty value trims
              away server-side when no file rides). */}
          <input type="hidden" name="quarantineKey" value="" />
          <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "8px" }}>
            {VC.new.sampleFileLabel}
            <input type="file" name="sample_file" accept=".md,.txt,.html" style={{ display: "block", marginTop: "4px", color: "var(--shell-fg)" }} />
          </label>
          <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "8px" }}>
            {VC.new.sampleUrlLabel}
            <input name="sample_url" type="url" placeholder={VC.urlPlaceholder} style={fieldStyle} />
          </label>
          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>{VC.new.sampleUrlHint}</p>
          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>{VC.new.sampleHint}</p>
          <fieldset style={{ border: "none", padding: 0, margin: "16px 0 0" }}>
            <legend style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.new.tierLabel}</legend>
            <label style={{ display: "block", fontSize: "14px", marginTop: "6px" }}>
              <input type="radio" name="tier" value="quick" defaultChecked /> {VC.new.quickOption}
              <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}> · {VC.new.quickHint}</span>
            </label>
            <label style={{ display: "block", fontSize: "14px", marginTop: "6px" }}>
              <input type="radio" name="tier" value="full" data-tier-full="true" /> {VC.new.fullOption}
              <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}> · {VC.new.fullHint}</span>
            </label>
          </fieldset>
          <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "16px" }}>
            {VC.new.modeLabel}{" "}
            <select name="mode" defaultValue="self" style={{ fontSize: "13px" }}>
              <option value="self">{VC.new.modeOption.self}</option>
              <option value="house">{VC.new.modeOption.house}</option>
              <option value="consented">{VC.new.modeOption.consented}</option>
              <option value="study">{VC.new.modeOption.study}</option>
            </select>
          </label>
          <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "16px", maxWidth: "68ch" }}>
            {VC.new.aup}
          </p>
          <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
            <button type="submit" name="intent" value="build" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
              {VC.new.createBuild}
            </button>
            <button type="submit" name="intent" value="save" style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", fontSize: "14px", cursor: "pointer" }}>
              {VC.new.createOnly}
            </button>
          </div>
        </form>
      </Shell>
    </div>
  );
}

// ---- /v/:persona — the §9.5 five-tab detail ------------------------------------------------------

const VOICE_TABS = ["overview", "description", "samples", "profile", "runs"] as const;
type VoiceTab = (typeof VOICE_TABS)[number];

/** The flash-param → notice mapping `GET /v/:persona` composes into `PageData.voice.notice`
 *  (server.ts) — the leaf derives the same line from its validated search. */
export function voiceNoticeFor(search: {
  readonly saved?: string;
  readonly added?: string;
  readonly cancelled?: string;
  readonly corrected?: string;
  readonly reconstruct?: string;
  readonly build_failed?: string;
}): string | undefined {
  return search.saved === "1"
    ? VC.detail.seedSaved
    : search.added === "1"
      ? VC.detail.sampleAdded
      : search.cancelled === "1"
        ? VC.detail.cancelDone
        : search.corrected === "1"
          ? VC.detail.correctionAdded
          : search.reconstruct === "queued"
            ? VC.detail.reconstructQueued
            : search.build_failed === "1"
              ? VC.new.fullRequired
              : undefined;
}

/** The tab bar — server-rendered links verbatim (`?tab=` document navs; the strangler re-decides). */
function voiceTabBar(pid: string, active: string): ReactNode {
  return (
    <nav data-voice-tabs="true" aria-label={VC.nav} style={{ display: "flex", gap: "14px", borderBottom: "1px solid var(--shell-border)", margin: "12px 0 16px", fontSize: "13px" }}>
      {VOICE_TABS.map((t) => (
        <a
          key={t}
          href={t === "overview" ? `/v/${pid}` : `/v/${pid}?tab=${t}`}
          data-voice-tab={t}
          aria-current={active === t ? "page" : undefined}
          style={{
            padding: "6px 2px",
            color: active === t ? "var(--shell-fg)" : "var(--shell-fg-muted)",
            fontWeight: active === t ? 600 : 400,
            borderBottom: active === t ? "2px solid var(--accent)" : "2px solid transparent",
            textDecoration: "none",
          }}
        >
          {VC.detail.tabs[t]}
        </a>
      ))}
    </nav>
  );
}

/** The §9.3 diff-of-inputs panel — pages.tsx `VoiceFactsPanelView` verbatim. */
function VoiceFactsPanelView({ detail, plan }: { detail: VoiceDetailDto; plan?: { route: { sentence: string } } }): ReactNode {
  const panel = detail.factsPanel;
  if (!panel) return null;
  return (
    <section data-facts-panel="true" style={{ marginTop: "14px", border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "10px 14px", maxWidth: "68ch" }}>
      <h2 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 6px", color: "var(--shell-fg-muted)" }}>{VC.detail.factsHeading}</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px", display: "grid", gap: "4px" }}>
        {panel.facts.map((f) => (
          <li key={f.key} data-fact={f.key} data-changed={f.changed ? "true" : "false"} style={{ color: f.changed ? "var(--shell-fg)" : "var(--shell-fg-muted)" }}>
            <span style={{ fontWeight: f.changed ? 600 : 400 }}>{f.label}</span>
            {" — "}
            {f.line}
          </li>
        ))}
      </ul>
      {panel.corpusWords.built != null ? (
        <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "6px 0 0" }}>
          {fmt(VC.detail.corpusLineFmt, {
            built: panel.corpusWords.built.toLocaleString("en-US"),
            current: panel.corpusWords.current.toLocaleString("en-US"),
          })}
          {panel.ageDays != null ? ` · ${fmt(VC.detail.ageFmt, { n: panel.ageDays })}` : ""}
        </p>
      ) : null}
      {plan?.route.sentence ? (
        <p data-update-route="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "8px 0 0" }}>
          {plan.route.sentence}
        </p>
      ) : null}
    </section>
  );
}

/** The §9.2 approve_sample gate card — pages.tsx `VoiceGateCardView` verbatim. */
function VoiceGateCardView({ pid, gate }: { pid: string; gate: NonNullable<VoiceDetailDto["gate"]> }): ReactNode {
  const card = gate.card;
  return (
    <section data-gate-card="true" style={{ marginTop: "14px", border: "1px solid var(--accent)", borderRadius: "8px", padding: "12px 14px", maxWidth: "68ch" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 6px" }}>{VC.detail.gateHeading}</h2>
      <p style={{ fontSize: "13px", margin: "0 0 4px" }}>{card.includedLine}</p>
      {card.exclusions.length > 0 ? (
        <>
          <p style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "6px 0 2px" }}>{VC.detail.gateExclusionsHeading}</p>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {card.exclusions.map((e) => (
              <li key={e.title}>
                {e.title} — {e.reason}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {card.holdoutLine ? (
        <p data-holdout-line="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "6px 0 0" }}>{card.holdoutLine}</p>
      ) : null}
      {card.calibrationWarning ? (
        <p data-calibration-warning="true" style={{ fontSize: "12px", color: "var(--sev-major)", margin: "6px 0 0" }}>{card.calibrationWarning}</p>
      ) : null}
      {card.estimate.credits != null ? (
        <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "6px 0 0" }}>
          {fmt(VC.detail.gateEstimateFmt, { n: card.estimate.credits, cap: card.estimate.capCredits ?? "—" })}
        </p>
      ) : null}
      {card.waitingUntil ? (
        <p data-gate-waiting="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "6px 0 0" }}>
          {fmt(VC.detail.gateWaitingFmt, { at: new Date(card.waitingUntil).toLocaleString("en-US", { timeZone: "UTC" }) })}
        </p>
      ) : null}
      <form method="post" action={`/v/${pid}/gates/${gate.gateId}`} style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
        <input type="hidden" name="runId" value={gate.runId} />
        <button type="submit" name="action" value="approve" data-gate-approve="true" style={{ padding: "7px 14px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          {VC.detail.gateApprove}
        </button>
        <button type="submit" name="action" value="wait" style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", fontSize: "13px", cursor: "pointer" }}>
          {VC.detail.gateWait}
        </button>
        <button type="submit" name="action" value="stop" style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "none", color: "var(--sev-major)", fontSize: "13px", cursor: "pointer" }}>
          {VC.detail.gateStop}
        </button>
      </form>
    </section>
  );
}

/** The §9.4 calibration table — pages.tsx `VoiceCalibrationTable` verbatim. */
function VoiceCalibrationTable({ calibration }: { calibration: NonNullable<VoiceDetailDto["calibration"]> }): ReactNode {
  const t = VC.detail.calibrationTable;
  return (
    <section data-calibration="true" style={{ marginTop: "16px", maxWidth: "68ch" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 4px" }}>{VC.detail.calibrationHeading}</h2>
      {calibration.verdict ? (
        <p data-calibration-verdict={String(calibration.verdict)} style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>
          {VC.detail.calibrationVerdict[String(calibration.verdict)] ?? String(calibration.verdict)}
          {" · "}
          {fmt(VC.detail.calibrationWithinFmt, { n: calibration.withinCount, total: calibration.totalCount })}
        </p>
      ) : null}
      <table style={{ fontSize: "12px", borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--shell-fg-muted)" }}>
            <th style={{ padding: "3px 8px 3px 0", fontWeight: 500 }}>{t.feature}</th>
            <th style={{ padding: "3px 8px", fontWeight: 500 }}>{t.target}</th>
            <th style={{ padding: "3px 8px", fontWeight: 500 }}>{t.prediction}</th>
            <th style={{ padding: "3px 8px", fontWeight: 500 }}>{t.real}</th>
            <th style={{ padding: "3px 0", fontWeight: 500 }}>{t.band}</th>
          </tr>
        </thead>
        <tbody>
          {calibration.rows.map((r) => (
            <tr key={r.feature} data-calibration-row={r.feature} data-within-band={r.withinBand ? "true" : "false"}>
              <td style={{ padding: "3px 8px 3px 0" }}>{r.feature}</td>
              <td style={{ padding: "3px 8px" }}>{r.target}</td>
              <td style={{ padding: "3px 8px" }}>{r.prediction ?? "—"}</td>
              <td style={{ padding: "3px 8px" }}>{r.actual}</td>
              <td style={{ padding: "3px 0", color: r.withinBand ? "var(--state-ready)" : "var(--sev-major)" }}>
                {r.withinBand ? "✓" : "✗"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---- P1.15 — the Samples tab's ingestion surface (§9.5) ------------------------------------------

/** One linked source card — pages.tsx `VoiceSourceCard` verbatim; the 'new' items render the
 *  checkbox review form (unchecked stays omitted and is NEVER fetched, REQ-INGEST-4/5). The
 *  review checkbox gains `aria-label` for component axe (REQ-VFY-6 — the SSR's bare input has no
 *  programmatic name; no hook or copy changes). */
function VoiceSourceCard({ pid, conn, samples }: { pid: string; conn: VoiceConnectionDto; samples: readonly VoiceSampleDto[] }): ReactNode {
  const pending = samples.filter((s) => s.connection_id === conn.id && s.state === "new" && s.external_id);
  return (
    <li data-source={conn.id} data-provider={conn.provider} style={{ border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "8px 12px", fontSize: "13px" }}>
      <div style={{ display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap" }}>
        <strong>{VC.detail.providerLabel[conn.provider] ?? conn.provider}</strong>
        <span style={{ color: "var(--shell-fg-muted)", fontSize: "12px" }}>{conn.handle ?? ""}</span>
        <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>
          {fmt(VC.detail.sourceItemsFmt, { included: String(conn.included), items: String(conn.items) })}
          {" · "}
          {conn.last_sync_at
            ? fmt(VC.detail.lastSyncFmt, { at: new Date(conn.last_sync_at).toLocaleString("en-US", { timeZone: "UTC" }) })
            : VC.detail.neverSynced}
        </span>
      </div>
      {conn.error ? (
        <p data-source-error="true" style={{ color: "var(--sev-major)", fontSize: "12px", margin: "6px 0 0" }}>{conn.error}</p>
      ) : null}
      <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
        {conn.provider !== "upload" && conn.provider !== "paste" ? (
          <form method="post" action={`/v/${pid}/connections/${conn.id}/discover`} style={{ margin: 0 }}>
            <button type="submit" data-discover="true" style={{ fontSize: "12px", background: "none", border: "1px solid var(--shell-border)", borderRadius: "6px", color: "var(--shell-fg)", padding: "3px 10px", cursor: "pointer" }}>
              {VC.detail.discoverCta}
            </button>
          </form>
        ) : null}
        <form method="post" action={`/v/${pid}/connections/${conn.id}/sync`} style={{ margin: 0 }}>
          <button type="submit" data-resync="true" style={{ fontSize: "12px", background: "none", border: "1px solid var(--shell-border)", borderRadius: "6px", color: "var(--shell-fg)", padding: "3px 10px", cursor: "pointer" }}>
            {VC.detail.resyncCta}
          </button>
        </form>
        <form method="post" action={`/v/${pid}/connections/${conn.id}/remove`} style={{ margin: 0 }}>
          <button type="submit" data-remove-source="true" style={{ fontSize: "12px", background: "none", border: "1px solid var(--shell-border)", borderRadius: "6px", color: "var(--sev-major)", padding: "3px 10px", cursor: "pointer" }}>
            {VC.detail.removeSourceCta}
          </button>
        </form>
      </div>
      {/* the per-source settings (§9.5 Settings): auto-include + daily auto-sync. */}
      <form method="post" action={`/v/${pid}/connections/${conn.id}/settings`} data-source-settings-form="true" style={{ margin: "6px 0 0", display: "flex", gap: "12px", alignItems: "center", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
        <label style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <input type="checkbox" name="autoIncludeNew" defaultChecked={conn.auto_include_new !== false} />
          {VC.detail.autoIncludeLabel}
        </label>
        <label style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <input type="checkbox" name="dailySync" defaultChecked={conn.schedule === "daily"} />
          {VC.detail.dailySyncLabel}
        </label>
        <button type="submit" style={{ fontSize: "12px", background: "none", border: "none", color: "var(--accent)", cursor: "pointer" }}>{VC.detail.saveSettingsCta}</button>
      </form>
      {/* the review step: 'new' items wait for the confirm click — a checked box includes, an
          unchecked one omits, and nothing fetches before this posts (REQ-INGEST-4). */}
      {pending.length > 0 ? (
        <form method="post" action={`/v/${pid}/connections/${conn.id}/confirm`} data-confirm="true" style={{ marginTop: "8px", borderTop: "1px solid var(--shell-border)", paddingTop: "8px" }}>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "4px" }}>
            {pending.map((s) => (
              <li key={s.id} data-review-item={s.external_id ?? s.id} style={{ display: "flex", gap: "8px", alignItems: "baseline", fontSize: "12px" }}>
                <input type="hidden" name="known" value={s.external_id ?? ""} />
                <input type="checkbox" name="include" value={s.external_id ?? ""} defaultChecked={s.access === "free"} aria-label={s.title ?? s.external_id ?? s.id} />
                <span style={{ flex: 1 }}>{s.title ?? s.external_id ?? s.id}</span>
                {s.access === "paywalled" ? (
                  <span style={{ color: "var(--sev-major)" }}>{VC.detail.paywallBadge}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: "11px", color: "var(--shell-fg-faint)", margin: "6px 0 4px" }}>{VC.detail.confirmNote}</p>
          <button type="submit" data-confirm-cta="true" style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontWeight: 600, cursor: "pointer" }}>
            {VC.detail.confirmCta}
          </button>
        </form>
      ) : null}
    </li>
  );
}

/** The Sources pane — pages.tsx `VoiceSourcesPane` verbatim: linked providers + the three link
 *  flows + "Re-sync all". The export form keeps `encType`/`file` markup (the no-JS floor is the
 *  same element); the delegated submit runs it through presign→PUT→`quarantineKey` (REQ-BFF-16). */
function VoiceSourcesPane({ pid, connections, samples }: { pid: string; connections?: VoiceConnectionsDto; samples: readonly VoiceSampleDto[] }): ReactNode {
  const conns = connections?.connections ?? [];
  return (
    <section data-sources="true" style={{ marginBottom: "16px" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 6px" }}>{VC.detail.sourcesHeading}</h2>
      {conns.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.detail.sourcesEmpty}</p>
      ) : (
        <>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "8px" }}>
            {conns.map((cn) => (
              <VoiceSourceCard key={cn.id} pid={pid} conn={cn} samples={samples} />
            ))}
          </ul>
          <form method="post" action={`/v/${pid}/sync`} style={{ margin: "8px 0 0" }}>
            <button type="submit" data-resync-all="true" style={{ fontSize: "12px", background: "none", border: "1px solid var(--shell-border)", borderRadius: "6px", color: "var(--shell-fg)", padding: "4px 12px", cursor: "pointer" }}>
              {VC.detail.resyncAllCta}
            </button>
          </form>
        </>
      )}
      {/* the three link flows — no credential field exists anywhere (never-cookies, AC-I-B). */}
      <div style={{ display: "grid", gap: "8px", marginTop: "10px", fontSize: "12px" }}>
        <form method="post" action={`/v/${pid}/connections`} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input type="hidden" name="provider" value="substack" />
          <label style={{ flex: 1, color: "var(--shell-fg-muted)" }}>
            {VC.detail.linkSubstackLabel}
            <input name="handle" placeholder={VC.detail.linkSubstackPlaceholder} style={{ ...fieldStyle, marginTop: "2px" }} />
          </label>
          <button type="submit" data-link-substack="true" style={{ ...submitStyle, width: "auto", padding: "5px 12px", fontSize: "12px" }}>{VC.detail.linkSubstackCta}</button>
        </form>
        <form method="post" action={`/v/${pid}/connections`} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input type="hidden" name="provider" value="url" />
          <label style={{ flex: 1, color: "var(--shell-fg-muted)" }}>
            {VC.detail.linkUrlLabel}
            <input name="url" type="url" placeholder={VC.urlPlaceholder} style={{ ...fieldStyle, marginTop: "2px" }} />
          </label>
          <button type="submit" data-link-url="true" style={{ ...submitStyle, width: "auto", padding: "5px 12px", fontSize: "12px" }}>{VC.detail.linkUrlCta}</button>
        </form>
        <form method="post" action={`/v/${pid}/connections`} encType="multipart/form-data" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input type="hidden" name="provider" value="substack_export" />
          <input type="hidden" name="quarantineKey" value="" />
          <label style={{ flex: 1, color: "var(--shell-fg-muted)" }}>
            {VC.detail.linkExportLabel}
            <input type="file" name="file" accept=".zip" style={{ display: "block", marginTop: "2px", color: "var(--shell-fg)" }} />
          </label>
          <button type="submit" data-link-export="true" style={{ ...submitStyle, width: "auto", padding: "5px 12px", fontSize: "12px" }}>{VC.detail.linkExportCta}</button>
        </form>
      </div>
    </section>
  );
}

/** The sample drawer (§9.5) — pages.tsx `VoiceSampleDrawer` verbatim: preview + versions + the
 *  priced reconstruction CTAs (visual only when the notes flag a scanned/no-text-layer source). */
function VoiceSampleDrawer({ pid, detail, compact = false }: { pid: string; detail: VoiceSampleDetailDto; compact?: boolean }): ReactNode {
  const head = detail.versions[0];
  const quality = head?.quality ?? null;
  const notes = [...(head?.quality_notes ?? [])];
  const visualOffered =
    quality === "unreadable" || notes.some((n) => /visual tier|scanned/i.test(n));
  return (
    <section data-sample-drawer="true" style={{ border: "1px solid var(--accent)", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 2px" }}>
        {detail.item.title ?? VC.detail.drawerHeading}
      </h2>
      <p style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>
        {VC.detail.stateBadge[detail.item.state] ?? detail.item.state}
        {detail.item.access === "paywalled" ? ` · ${VC.detail.paywallBadge}` : ""}
        {quality ? ` · ${VC.detail.qualityBadge[quality] ?? quality}` : ""}
        {detail.item.url ? <> · <a href={detail.item.url} style={{ color: "var(--accent)" }}>{detail.item.url}</a></> : null}
      </p>
      {notes.length > 0 ? (
        <div data-quality-notes="true" style={{ margin: "6px 0" }}>
          <h3 style={{ fontSize: "12px", fontWeight: 600, color: "var(--shell-fg-muted)", margin: "0 0 2px" }}>{VC.detail.qualityNotesHeading}</h3>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {/* the priced reconstruction — text tier always for non-clean; visual only when the notes
          flag a scanned/no-text-layer source (the opt-in ~180-credit pass).
          P1.19 — §10.1 ✗: a building control — suppressed on phone width. */}
      {!compact && quality && quality !== "clean" && quality !== "reconstructed" ? (
        <div style={{ display: "flex", gap: "8px", margin: "8px 0", flexWrap: "wrap" }}>
          <form method="post" action={`/v/${pid}/samples/${detail.item.id}/reconstruct`} style={{ margin: 0 }}>
            <input type="hidden" name="tier" value="text" />
            <button type="submit" data-reconstruct-text="true" style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", cursor: "pointer" }}>
              {VC.detail.reconstructTextCta}
            </button>
          </form>
          {visualOffered ? (
            <form method="post" action={`/v/${pid}/samples/${detail.item.id}/reconstruct`} style={{ margin: 0 }}>
              <input type="hidden" name="tier" value="visual" />
              <button type="submit" data-reconstruct-visual="true" style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", cursor: "pointer" }}>
                {VC.detail.reconstructVisualCta}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
      <h3 style={{ fontSize: "12px", fontWeight: 600, color: "var(--shell-fg-muted)", margin: "8px 0 2px" }}>{VC.detail.previewHeading}</h3>
      {detail.document ? (
        <pre data-sample-preview="true" style={{ fontSize: "12px", whiteSpace: "pre-wrap", maxHeight: "320px", overflow: "auto", border: "1px solid var(--shell-border)", borderRadius: "6px", padding: "8px", margin: 0 }}>
          {detail.document}
        </pre>
      ) : (
        <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)" }}>{VC.detail.noDocument}</p>
      )}
      {detail.versions.length > 0 ? (
        <>
          <h3 style={{ fontSize: "12px", fontWeight: 600, color: "var(--shell-fg-muted)", margin: "8px 0 2px" }}>{VC.detail.versionsHeading}</h3>
          <ul data-sample-versions="true" style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            {detail.versions.map((v) => (
              <li key={v.id} data-version={v.n}>
                {fmt(VC.detail.versionFmt, { n: String(v.n), quality: v.quality ?? "—" })}
                {v.word_count != null ? ` · ${v.word_count.toLocaleString("en-US")} w` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

/** Auth-gated: the voice detail page (§9.5) — `VoiceDetailPage` verbatim on the `voiceDetail`
 *  twin; `tab`/`notice` arrive as props from the leaf's validated search (URL state, never
 *  payload — the SAME mapping the document's PageData composition runs). */
export function VoiceDetailSurface({
  voice,
  tab,
  notice,
  compact,
}: {
  readonly voice: BffVoiceDetailTwin["voice"] | null;
  readonly tab?: string;
  readonly notice?: string;
  readonly compact: boolean;
}): ReactNode {
  const onSubmit = useVoiceFormSubmit();
  const d = voice?.detail;
  const pid = d?.persona.id ?? "";
  const active: VoiceTab = VOICE_TABS.includes(tab as VoiceTab) ? (tab as VoiceTab) : "overview";
  const holdout = d?.holdout;
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <Shell brand={COPY.brand} nav={<a href="/voices">{VC.detail.backToList}</a>} footer={footer()}>
        <PageTitle>{d?.persona.display_name ?? ""}</PageTitle>
        {d?.persona.byline ? <p style={{ color: "var(--shell-fg-muted)", fontSize: "13px", marginTop: "-6px" }}>{d.persona.byline}</p> : null}
        {d && d.members && d.members.length > 0 ? (
          <p data-composed-from="true" style={{ color: "var(--shell-fg-muted)", fontSize: "12px", marginTop: "2px" }}>
            {fmt(VC.card.composedFmt, { names: d.members.map((m) => m.display_name ?? m.id).join(", ") })}
          </p>
        ) : null}
        <p data-voice-status="true" style={{ margin: "4px 0 0" }}>
          {voicePillSpan(d?.status)}
          {voice?.estimate ? (
            <span style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginLeft: "10px" }}>
              {fmt(VC.detail.estimateFmt, { n: voice.estimate.estimateCredits })}
            </span>
          ) : null}
        </p>
        {notice != null ? (
          <p role="status" style={{ color: "var(--state-ready)", fontSize: "13px" }}>{notice}</p>
        ) : null}
        {d ? (
          <>
            {voiceTabBar(pid, active)}

            {active === "overview" ? (
              <>
                {/* Build / update / cancel — the pill's ONE verb (§9.3).
                    P1.19 — §10.1 ✗: voice-building controls never render on phone width. */}
                {compact === true ? <PhoneBlockedNote /> : (
                  <div style={{ display: "flex", gap: "10px", margin: "10px 0" }}>
                    {d.status.action === "build" ? (
                      <form method="post" action={`/v/${pid}/build`} style={{ margin: 0 }}>
                        <button type="submit" data-build-voice="true" style={{ padding: "7px 14px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                          {VC.detail.buildCta}
                        </button>
                      </form>
                    ) : null}
                    {d.status.action === "update_voice" || d.status.action === "test" ? (
                      <form method="post" action={`/v/${pid}/update`} style={{ margin: 0 }}>
                        <button type="submit" data-update-voice="true" style={{ padding: "7px 14px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                          {d.status.action === "test" ? VC.detail.testCta : VC.detail.updateCta}
                        </button>
                      </form>
                    ) : null}
                    {d.upgradeRoute ? (
                      <form method="post" action={`/v/${pid}/update`} style={{ margin: 0 }}>
                        <input type="hidden" name="scope" value="full_from_quick" />
                        <button type="submit" data-upgrade-voice="true" style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", fontSize: "13px", cursor: "pointer" }}>
                          {VC.detail.upgradeCta}
                        </button>
                      </form>
                    ) : null}
                    {d.persona.active_run_id ? (
                      <form method="post" action={`/v/${pid}/cancel`} style={{ margin: 0 }}>
                        <input type="hidden" name="runId" value={d.persona.active_run_id} />
                        <button type="submit" style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", fontSize: "13px", cursor: "pointer" }}>
                          {VC.detail.cancelRun}
                        </button>
                      </form>
                    ) : null}
                  </div>
                )}

                {d.gate ? <VoiceGateCardView pid={pid} gate={d.gate} /> : null}
                <VoiceFactsPanelView detail={d} plan={voice?.updatePlan} />

                {/* the Overview's hub paragraph — profile/index.md's head text when a build produced it. */}
                {d.hubMarkdown ? (
                  <section data-hub="true" style={{ marginTop: "16px", maxWidth: "68ch", fontSize: "14px", whiteSpace: "pre-wrap" }}>
                    {d.hubMarkdown}
                  </section>
                ) : null}
                {holdout?.held && !holdout.revealed ? (
                  <p data-holdout-hidden="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "12px" }}>
                    {VC.detail.holdoutGeneric}
                  </p>
                ) : null}
                {d.projects.length > 0 ? (
                  <section data-projects="true" style={{ marginTop: "16px", maxWidth: "68ch" }}>
                    <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>{VC.detail.projectsHeading}</h2>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px", display: "grid", gap: "4px" }}>
                      {d.projects.map((p) => (
                        <li key={p.id}>
                          <a href={`/p/${p.slug}`}>{p.title}</a>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {/* P1.15 — the §9.5 delete: purge-eligible personas schedule voice.purge (the
                    30-day window); the typed "delete" confirm guards the destructive POST.
                    P1.19 — §10.1 ✗: never rendered on phone width. */}
                {compact === true ? null : (
                  <section data-voice-delete="true" style={{ marginTop: "24px", maxWidth: "68ch", borderTop: "1px solid var(--shell-border)", paddingTop: "12px" }}>
                    <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--sev-major)", margin: "0 0 4px" }}>{VC.detail.deleteVoiceHeading}</h2>
                    <p style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "0 0 6px" }}>{VC.detail.deleteVoiceNote}</p>
                    <form method="post" action={`/v/${pid}/delete`} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      {/* REQ-VFY-6 — aria-label the typed-confirm input (no hook/copy change). */}
                      <input name="confirm" placeholder={VC.detail.deletePlaceholder} aria-label={VC.detail.deleteVoiceHeading} style={{ ...fieldStyle, maxWidth: "14ch" }} />
                      <button type="submit" data-delete-voice="true" style={{ padding: "6px 14px", borderRadius: "8px", border: "1px solid var(--sev-major)", background: "none", color: "var(--sev-major)", fontSize: "13px", cursor: "pointer" }}>
                        {VC.detail.deleteVoiceCta}
                      </button>
                    </form>
                  </section>
                )}
              </>
            ) : null}

            {active === "description" ? (
              <>
                {/* the seed editor — plain markdown; on save the J9 hash recomputes and the pill flips live. */}
                <section data-seed-editor="true" style={{ maxWidth: "68ch" }}>
                  {d.persona.seed_authored_by === "persona_builder" ? (
                    <p data-agent-drafted="true" style={{ fontSize: "12px", color: "var(--sev-major)", margin: "0 0 6px" }}>
                      {VC.detail.agentDraftedMark}
                    </p>
                  ) : null}
                  {/* P1.19 — §10.1 ✗: seed edits are a voice-building control — suppressed on phone width. */}
                  {compact === true ? <PhoneBlockedNote /> : (
                    <form method="post" action={`/v/${pid}/seed`}>
                      <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "block" }}>
                        {VC.detail.bylineLabel}
                        <input name="byline" defaultValue={d.persona.byline ?? ""} style={fieldStyle} />
                      </label>
                      <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "block", marginTop: "8px" }}>
                        {VC.detail.registersLabel}
                        <input name="registers" defaultValue={(d.persona.registers ?? []).join(", ")} style={fieldStyle} />
                      </label>
                      {/* REQ-VFY-6 — the SSR's bare textarea has no programmatic name; aria-label
                          carries the section's heading word (no hook/copy change). */}
                      <textarea name="description" defaultValue={d.seedMarkdown} aria-label={VC.detail.seedHeading} style={{ ...textAreaStyle, marginTop: "8px" }} />
                      <button type="submit" style={{ ...submitStyle, width: "auto", marginTop: "8px", padding: "7px 14px", fontSize: "13px" }}>
                        {VC.detail.seedSave}
                      </button>
                    </form>
                  )}
                </section>

                {/* the corrections ledger (§9.4): a correction lands as a blockquote on the seed + a
                    consume-once row the next build picks up. */}
                <section data-corrections="true" style={{ marginTop: "18px", maxWidth: "68ch" }}>
                  <h2 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 6px" }}>{VC.detail.correctionsHeading}</h2>
                  {(d.corrections ?? []).length === 0 ? (
                    <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.detail.correctionsEmpty}</p>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px", fontSize: "13px", display: "grid", gap: "6px" }}>
                      {(d.corrections ?? []).map((cr) => (
                        <li key={cr.id} data-correction={cr.id} data-consumed={cr.consumed_by_profile_id ? "true" : "false"} style={{ border: "1px solid var(--shell-border)", borderRadius: "6px", padding: "6px 10px" }}>
                          <span>{cr.text}</span>
                          <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px", marginLeft: "8px" }}>
                            {cr.consumed_by_profile_id ? VC.detail.correctionConsumed : VC.detail.correctionPending}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {compact === true ? null : (
                    <form method="post" action={`/v/${pid}/corrections`}>
                      <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "block" }}>
                        {VC.detail.correctionLabel}
                        <textarea name="text" required placeholder={VC.detail.correctionPlaceholder} style={{ ...textAreaStyle, minHeight: "60px", marginTop: "4px" }} />
                      </label>
                      <button type="submit" style={{ ...submitStyle, width: "auto", marginTop: "8px", padding: "7px 14px", fontSize: "13px" }}>
                        {VC.detail.correctionCta}
                      </button>
                    </form>
                  )}
                </section>

                {/* build notes — the last build's own notes (§9.4). */}
                {(d.buildNotes ?? []).length > 0 ? (
                  <section data-build-notes="true" style={{ marginTop: "18px", maxWidth: "68ch" }}>
                    <h2 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 6px" }}>{VC.detail.buildNotesHeading}</h2>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px", display: "grid", gap: "6px" }}>
                      {(d.buildNotes ?? []).map((n) => (
                        <li key={n.id} data-build-note={n.id} style={{ border: "1px solid var(--shell-border)", borderRadius: "6px", padding: "6px 10px", whiteSpace: "pre-wrap" }}>
                          {typeof n.body === "string" ? n.body : JSON.stringify(n.body)}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            ) : null}

            {active === "samples" ? (
              <section data-samples="true" style={{ maxWidth: "68ch" }}>
                {/* P1.15 — the Sources pane: linked providers + the review-confirm step + the three
                    link flows + Re-sync all. P1.19 — §10.1 ✗: a building surface — hidden on phone. */}
                {compact === true ? null : (
                  <VoiceSourcesPane pid={pid} connections={voice?.connections} samples={d.samples} />
                )}
                {/* the open drawer — `?tab=samples&sample=<itemId>` (§9.5 preview/versions). */}
                {voice?.sampleDetail ? <VoiceSampleDrawer pid={pid} detail={voice.sampleDetail} compact={compact === true} /> : null}
                {d.samples.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.detail.samplesEmpty}</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "6px" }}>
                    {d.samples.map((s) => (
                      <li key={s.id} data-sample={s.id} style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "13px", border: "1px solid var(--shell-border)", borderRadius: "6px", padding: "6px 10px" }}>
                        <a href={`/v/${pid}?tab=samples&sample=${encodeURIComponent(s.id)}`} data-sample-open={s.id} style={{ flex: 1, color: "var(--shell-fg)", textDecoration: "none" }}>
                          {s.title ?? s.id}
                        </a>
                        {/* the hold-out badge shows ONLY post-reveal (§9.4) — pre-calibration the
                            identity stays server-side; the generic line is on Overview. */}
                        {holdout?.revealed && holdout.itemId === s.id ? (
                          <span data-holdout-badge="true" style={{ color: "var(--accent)", fontSize: "12px" }}>
                            {fmt(VC.detail.holdoutRevealedFmt, { title: s.title ?? s.id })}
                          </span>
                        ) : null}
                        {/* P1.15 — the item's ingest state + paywall + quality verdicts ride the row. */}
                        {s.state !== "included" ? (
                          <span data-sample-state={s.state} style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>
                            {VC.detail.stateBadge[s.state] ?? s.state}
                          </span>
                        ) : null}
                        {s.access === "paywalled" ? (
                          <span data-sample-paywalled="true" style={{ color: "var(--sev-major)", fontSize: "12px" }}>{VC.detail.paywallBadge}</span>
                        ) : null}
                        {s.quality && s.quality !== "clean" ? (
                          <span data-sample-quality={s.quality} style={{ color: "var(--sev-major)", fontSize: "12px" }}>
                            {VC.detail.qualityBadge[s.quality] ?? s.quality}
                          </span>
                        ) : null}
                        <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>
                          {s.word_count != null ? `${s.word_count.toLocaleString("en-US")} w` : ""}
                        </span>
                        <a href={`/v/${pid}?tab=samples&sample=${encodeURIComponent(s.id)}`} style={{ fontSize: "12px", color: "var(--accent)", textDecoration: "none" }}>
                          {VC.detail.viewLabel}
                        </a>
                        {compact === true ? null : (
                          <form method="post" action={`/v/${pid}/samples/${s.id}`} style={{ margin: 0 }}>
                            <button type="submit" name="included" value={s.state === "included" ? "false" : "true"} style={{ fontSize: "12px", background: "none", border: "none", color: "var(--accent)", cursor: "pointer" }}>
                              {s.state === "included" ? VC.detail.omitLabel : VC.detail.includeLabel}
                            </button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {compact === true ? null : (
                  <form method="post" action={`/v/${pid}/samples`} encType="multipart/form-data" data-samples-form="true" style={{ marginTop: "10px" }}>
                    <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "block" }}>
                      {VC.detail.addSampleTitleLabel}
                      <input name="title" style={fieldStyle} />
                    </label>
                    <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "block", marginTop: "6px" }}>
                      {VC.detail.addSampleLabel}
                      <textarea name="text" style={{ ...textAreaStyle, minHeight: "100px" }} />
                    </label>
                    <input type="hidden" name="quarantineKey" value="" />
                    <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "block", marginTop: "6px" }}>
                      {VC.detail.addSampleFileLabel}
                      <input type="file" name="file" accept=".md,.txt,.html" style={{ display: "block", marginTop: "4px", color: "var(--shell-fg)" }} />
                    </label>
                    <button type="submit" style={{ ...submitStyle, width: "auto", marginTop: "8px", padding: "7px 14px", fontSize: "13px" }}>
                      {VC.detail.addSampleCta}
                    </button>
                  </form>
                )}
                {/* the fetcher-only URL path (REQ-INGEST-13) — the URL is fetched once, server-side. */}
                {compact === true ? null : (
                  <form method="post" action={`/v/${pid}/samples/url`} style={{ marginTop: "10px" }}>
                    <label style={{ fontSize: "12px", color: "var(--shell-fg-muted)", display: "block" }}>
                      {VC.detail.addSampleUrlLabel}
                      <input name="url" type="url" placeholder={VC.urlPlaceholder} style={fieldStyle} />
                    </label>
                    <button type="submit" data-add-url="true" style={{ ...submitStyle, width: "auto", marginTop: "8px", padding: "7px 14px", fontSize: "13px" }}>
                      {VC.detail.addUrlCta}
                    </button>
                  </form>
                )}
              </section>
            ) : null}

            {active === "profile" ? (
              <>
                {d.snapshot ? (
                  <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "0 0 8px" }}>
                    {VC.card.tierLabel[d.snapshot.tier ?? ""] ?? d.snapshot.tier ?? ""} · {fmt(VC.detail.calibrationVerdict[d.snapshot.calibrationStatus ?? ""] ?? d.snapshot.calibrationStatus ?? "untested", {})}
                  </p>
                ) : (
                  <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.detail.profileEmpty}</p>
                )}
                {d.upgradeRoute && compact !== true ? (
                  <form method="post" action={`/v/${pid}/update`} style={{ margin: "0 0 12px" }}>
                    <input type="hidden" name="scope" value="full_from_quick" />
                    <button type="submit" data-upgrade-voice="true" style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", fontSize: "13px", cursor: "pointer" }}>
                      {VC.detail.upgradeCta}
                    </button>
                  </form>
                ) : null}
                {d.calibration ? <VoiceCalibrationTable calibration={d.calibration} /> : null}
                {/* the Profile tab's fixed §9.4 order — calibration report first, collapsed sections
                    folded, the (Advanced) measures last-but-lexicon. */}
                <section data-profile-sections="true" style={{ marginTop: "14px", maxWidth: "68ch" }}>
                  {(d.profileSections ?? []).map((sec) => {
                    const art = sec.path ? d.artifacts.find((a) => a.mirror_path === sec.path) : null;
                    const emptyPara = (
                      <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>{VC.detail.sectionEmpty}</p>
                    );
                    // Statement-shaped arms — the copy-containment scan keys on a `>…<` span, so
                    // each branch is a `return` (code tokens) rather than a bare ternary.
                    const inner = (() => {
                      if (sec.key === "voice-measures") {
                        if (!d.measures) return emptyPara;
                        return (
                          <pre data-voice-measures="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                            {JSON.stringify(d.measures.corpus, null, 0)}
                          </pre>
                        );
                      }
                      if (!art) return emptyPara;
                      return (
                        <p style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "4px 0 0" }}>{art.mirror_path}</p>
                      );
                    })();
                    const body = (
                      <>
                        <h3 style={{ fontSize: "13px", fontWeight: 600, margin: "0", display: "inline" }}>
                          {sec.key}
                          {sec.advanced ? <span style={{ color: "var(--shell-fg-faint)", fontWeight: 400 }}> {VC.detail.advancedTag}</span> : null}
                        </h3>
                        {inner}
                      </>
                    );
                    return sec.collapsed ? (
                      <details key={sec.key} data-profile-section={sec.key} style={{ marginBottom: "10px" }}>
                        <summary style={{ cursor: "pointer" }}>{body}</summary>
                      </details>
                    ) : (
                      <section key={sec.key} data-profile-section={sec.key} style={{ marginBottom: "10px" }}>
                        {body}
                      </section>
                    );
                  })}
                </section>
                {/* derived profile artifacts — read-only by policy (§9.5 row 36; a write attempt 405s). */}
                <section data-artifacts="true" style={{ marginTop: "14px", maxWidth: "68ch" }}>
                  <h2 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 6px", color: "var(--shell-fg-muted)" }}>{VC.detail.artifactsHeading}</h2>
                  {d.artifacts.length === 0 ? (
                    <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.detail.artifactsEmpty}</p>
                  ) : (
                    <>
                      <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "0 0 6px" }}>{VC.detail.artifactsNote}</p>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px", display: "grid", gap: "4px" }}>
                        {d.artifacts.map((a) => (
                          <li key={a.version_id} data-artifact-kind={a.kind}>
                            {a.mirror_path} · {a.kind}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              </>
            ) : null}

            {active === "runs" ? (
              <section data-runs="true" style={{ maxWidth: "68ch" }}>
                {d.runs.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.detail.runsEmpty}</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px", display: "grid", gap: "4px" }}>
                    {d.runs.map((r) => (
                      <li key={r.id} data-run={r.id}>
                        {r.workflow} · {VC.detail.runStateLabel[r.state] ?? r.state} · {r.spent_credits} cr ·{" "}
                        {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                      </li>
                    ))}
                  </ul>
                )}
                {d.profiles.length > 0 ? (
                  <>
                    <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--shell-fg-muted)", margin: "14px 0 6px" }}>{VC.detail.snapshotsHeading}</h2>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px", display: "grid", gap: "4px" }}>
                      {d.profiles.map((p) => (
                        <li key={p.id} data-profile={p.id}>
                          {new Date(p.built_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} ·{" "}
                          {VC.card.tierLabel[p.tier ?? ""] ?? p.tier ?? ""} ·{" "}
                          {VC.detail.calibrationVerdict[p.calibration_status ?? ""] ?? p.calibration_status ?? ""}
                          {p.corpus_size_at_build != null ? ` · ${p.corpus_size_at_build.toLocaleString("en-US")} w` : ""}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
      </Shell>
    </div>
  );
}

// ---- /p/:project/voice/reseed — the §9.6 charter-diff preview ------------------------------------

/** P1.14 — the adopt dialog's charter-diff preview (§9.6) — `VoiceReseedPage` verbatim on the
 *  reseed twin. The confirm buttons post the adopt with `reseed` set — the delegated submit's
 *  submitter capture carries which one was pressed. */
export function VoiceReseedSurface({
  voiceReseed,
  compact,
}: {
  readonly voiceReseed: BffVoiceReseedTwin["voiceReseed"] | null;
  readonly compact: boolean;
}): ReactNode {
  const onSubmit = useVoiceFormSubmit();
  const slug = voiceReseed?.slug ?? "";
  const preview = voiceReseed?.preview;
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <Shell brand={COPY.brand} nav={<a href={`/p/${slug}`}>{VC.detail.backToList}</a>} footer={footer()}>
        <PageTitle>{VC.detail.reseedPreviewCta}</PageTitle>
        {/* P1.19 — §10.1 ✗: diffs + voice-building actions never render on phone width. */}
        {compact === true ? <PhoneBlockedNote /> : null}
        {preview && compact !== true ? (
          <>
            {!preview.charterFound ? (
              <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{VC.detail.reseedNoCharter}</p>
            ) : (
              <pre data-reseed-diff="true" style={{ fontSize: "12px", maxWidth: "88ch", whiteSpace: "pre-wrap", border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "10px 14px" }}>
                {preview.diff.map((l, i) => (
                  <div key={i} data-diff-kind={l.kind} style={{ color: l.kind === "added" ? "var(--state-ready)" : l.kind === "removed" ? "var(--sev-major)" : "var(--shell-fg-muted)" }}>
                    {l.kind === "added" ? "+ " : l.kind === "removed" ? "- " : "  "}
                    {l.line}
                  </div>
                ))}
              </pre>
            )}
            <p data-guidance-preserved={preview.guidancePreserved ? "true" : "false"} style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "8px" }}>
              {preview.guidancePreserved ? VC.detail.reseedGuidanceKept : VC.detail.reseedGuidanceLost}
            </p>
            <form method="post" action={`/p/${slug}/voice/adopt`} style={{ marginTop: "12px", display: "flex", gap: "10px" }}>
              <button type="submit" name="reseed" value="true" data-adopt-reseed="true" style={{ padding: "7px 14px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                {VC.detail.adoptReseedCta}
              </button>
              <button type="submit" name="reseed" value="false" style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", fontSize: "13px", cursor: "pointer" }}>
                {VC.detail.adoptCta}
              </button>
            </form>
          </>
        ) : null}
      </Shell>
    </div>
  );
}
