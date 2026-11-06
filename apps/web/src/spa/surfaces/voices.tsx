// SPA.13 — the `voices` surface's React twins (REQ-SEQ-9, REQ-BFF-1/2/9/16, REQ-DAT-4, REQ-TST-2,
// REQ-VFY-2/6; design/22 §2 voices/voicesNew/voiceDetail/p.voiceReseed rows). `VoicesSurface`,
// `VoiceNewSurface`, `VoiceDetailSurface`, and `VoiceReseedSurface` port pages.tsx `VoicesPage` /
// `VoiceNewPage` / `VoiceDetailPage` / `VoiceReseedPage` — the same `<PageBody>`/`<PageHeader>`
// chrome, the same tab bar, the same `data-*` vocabulary — on data read through the `voices*Query`
// twins instead of `usePageData()`. Every hook literal resolves to dom-contract.ts; nothing
// unmanifested is invented.
//
// 240a_R7KIT.3a2 (REQ-KIT-3 batch a; REQ-GUARD-1; REQ-KIT-4's D4; UXC-16): every control is a 225a
// primitive (Button/TextField/TextArea/Select/Checkbox/RadioGroup — the Radix pickers' own hidden
// form carriers keep the no-JS post grammar verbatim), every spacing/type/colour/radius value rides
// `.ui-vc-*`/`.ui-set-*` classes from `uiCss()`, and enum keys render through the COPY label maps
// (`sourceKind`, `providerLabel`, `stateBadge`, `qualityBadge`, `calibrationVerdict`,
// `runStateLabel`, `tierLabel`, `usage.workflowLabels`) with a humanized fallback — no
// `substack_export`-style key reaches rendered text (D4). `HiddenField` is the file's one named
// GUARD-1 exemption — the hidden id/flag carriers the Radix pickers do not own (RV-36).
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
import { PageBody, PageHeader } from "../page-header.js";
import {
  Button,
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  Select,
  TextArea,
  TextField,
} from "@rhema/ui";
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

const { voice: VC, usage: U } = COPY;

/** `{key}`-template substitution — the local twin of pages.tsx's `fmt` (one helper, both renderers). */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** "run_progress" → "Run progress" — the humanized fallback an unlisted enum key degrades to. */
function humanizeKey(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** REQ-KIT-4 (D4) — an enum key renders its COPY label; an unlisted key humanizes, never leaks. */
function enumLabel(map: Record<string, string> | undefined, key: string): string {
  return map?.[key] ?? humanizeKey(key);
}

/**
 * The no-JS form grammar's hidden carrier — GUARD-1's named exemption owns this one component
 * (Radix's own hidden select/radio/checkbox carriers post the named fields; the id/flag carriers
 * it does not own — runId, provider, scope, tier, quarantineKey, known — ride this, RV-36).
 */
function HiddenField({
  name,
  value,
}: {
  readonly name: string;
  readonly value: string;
}): ReactNode {
  return <input type="hidden" name={name} value={value} />;
}

/** P1.19 — the §10.1 ✗ column's phone-width note (pages.tsx `PhoneBlockedNote` verbatim). */
function PhoneBlockedNote(): ReactNode {
  return (
    <p data-phone-blocked="true" className="ui-set-t ui-set-t--m ui-set-t--meas">
      {COPY.phoneBlocked.note}
    </p>
  );
}

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
    <span data-voice-pill={status.pill.tone} className="ui-set-t--sm ui-set-t--m">
      {status.pill.label}
    </span>
  );
}

/** One library card (§9.1) — pages.tsx `VoiceCard` verbatim; REQ-KIT-4's D4 renders `sources`
 *  through `detail.sourceKind` — "Substack export", never `substack_export`. */
function VoiceCard({ v }: { v: VoiceListRowDto }): ReactNode {
  return (
    <li key={v.personaId} data-voice-card={v.personaId} data-voice-group={v.group} className="ui-vc-card">
      <a href={`/v/${v.personaId}`} className="ui-vc-name">
        {v.name ?? v.personaId}
      </a>
      {v.byline ? <span className="ui-set-t--sm ui-set-t--m"> · {v.byline}</span> : null}
      {v.readOnly ? (
        <span data-read-only="true" className="ui-vc-faint ui-vc-tag ui-vc-up">
          {VC.card.readOnlyNote}
        </span>
      ) : null}
      {v.tier ? (
        <span data-voice-tier={v.tier} className="ui-vc-faint ui-vc-tag">
          {enumLabel(VC.card.tierLabel, v.tier)}
        </span>
      ) : null}
      {v.members.length > 0 ? (
        <div data-composed-from="true" className="ui-set-t--sm ui-set-t--m">
          {fmt(VC.card.composedFmt, { names: v.members.map((m) => m.name ?? m.personaId).join(", ") })}
        </div>
      ) : null}
      <div className="ui-set-form ui-set-t--sm ui-set-t--f">
        {voicePillSpan(v.status)}
        <span>{fmt(VC.sampleCountFmt, { n: v.sampleCount })}</span>
        {v.sources.length > 0 ? (
          <span data-voice-sources="true">
            {v.sources.map((s) => enumLabel(VC.detail.sourceKind, s)).join(" · ")}
          </span>
        ) : null}
        {v.projectCount > 0 ? <span>{fmt(VC.card.projectsFmt, { n: v.projectCount })}</span> : null}
        {v.lastBuiltAt ? (
          <span>{fmt(VC.card.lastBuiltFmt, { d: new Date(v.lastBuiltAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) })}</span>
        ) : null}
        {v.readOnly ? (
          <form method="post" action={`/v/${v.personaId}/fork`}>
            <Button type="submit" variant="ghost" size="sm" data-fork-voice={v.personaId}>
              {VC.card.forkCta}
            </Button>
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
      <PageBody>
        <PageHeader title={VC.listHeading} />
        {/* P1.19 — §10.1 ✗: new voice is a building surface — never offered on phone width. */}
        {compact === true ? null : (
          <p>
            <a href="/voices/new" data-new-voice="true">{VC.newCta}</a>
          </p>
        )}
        {total === 0 ? (
          <p className="ui-set-t ui-set-t--m">{VC.listEmpty}</p>
        ) : (
          sections.map((s) => {
            const rows = groups?.[s.key] ?? [];
            return (
              <section key={s.key} data-voice-group-section={s.key} className="ui-vc-sec">
                <h2 className="ui-prow-heading">
                  {s.heading}
                </h2>
                {rows.length === 0 ? (
                  <p className="ui-set-t ui-set-t--f">{s.empty}</p>
                ) : (
                  <ul className="ui-vc-list">
                    {rows.map((v) => (
                      <VoiceCard key={v.personaId} v={v} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </PageBody>
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
        <PageBody>
          <PageHeader title={VC.new.heading} />
          <PhoneBlockedNote />
        </PageBody>
      </div>
    );
  }
  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <PageBody>
        <PageHeader title={VC.new.heading} />
        {refusal != null ? (
          <p role="alert" className="ui-set-t ui-set-t--warn">{refusal}</p>
        ) : null}
        <form method="post" action="/voices/new" encType="multipart/form-data" className="ui-set-t--meas ui-vc-form">
          <label className="ui-vc-lab">
            {VC.new.nameLabel}
            <TextField name="name" required placeholder={VC.new.namePlaceholder} />
          </label>
          <label className="ui-vc-lab">
            {VC.new.bylineLabel}
            <TextField name="byline" />
          </label>
          <label className="ui-vc-lab">
            {VC.new.describeLabel}
            <TextArea name="description" />
          </label>
          <p className="ui-set-note">{VC.new.describeHint}</p>
          <label className="ui-vc-lab">
            {VC.new.sampleTitleLabel}
            <TextField name="sample_title" />
          </label>
          <label className="ui-vc-lab">
            {VC.new.sampleLabel}
            <TextArea name="sample_text" />
          </label>
          {/* REQ-BFF-16 — the presign→PUT leg's key carrier; it precedes the file input in DOM
              order so the collected `""` is overwritten by the minted key (an empty value trims
              away server-side when no file rides). */}
          <HiddenField name="quarantineKey" value="" />
          <label className="ui-vc-lab">
            {VC.new.sampleFileLabel}
            <TextField type="file" name="sample_file" accept=".md,.txt,.html" />
          </label>
          <label className="ui-vc-lab">
            {VC.new.sampleUrlLabel}
            <TextField name="sample_url" type="url" placeholder={VC.urlPlaceholder} />
          </label>
          <p className="ui-set-note">{VC.new.sampleUrlHint}</p>
          <p className="ui-set-note">{VC.new.sampleHint}</p>
          <fieldset className="ui-set-fs">
            <legend>{VC.new.tierLabel}</legend>
            <RadioGroup name="tier" defaultValue="quick" aria-label={VC.new.tierLabel}>
              <label className="ui-set-row">
                <RadioGroupItem value="quick" aria-label={VC.new.quickOption} /> {VC.new.quickOption}
                <span className="ui-set-t--sm ui-set-t--f"> · {VC.new.quickHint}</span>
              </label>
              <label className="ui-set-row">
                <RadioGroupItem value="full" data-tier-full="true" aria-label={VC.new.fullOption} />{" "}
                {VC.new.fullOption}
                <span className="ui-set-t--sm ui-set-t--f"> · {VC.new.fullHint}</span>
              </label>
            </RadioGroup>
          </fieldset>
          <label className="ui-vc-lab">
            {VC.new.modeLabel}{" "}
            <Select
              name="mode"
              defaultValue="self"
              aria-label={VC.new.modeLabel}
              items={[
                { value: "self", label: VC.new.modeOption.self },
                { value: "house", label: VC.new.modeOption.house },
                { value: "consented", label: VC.new.modeOption.consented },
                { value: "study", label: VC.new.modeOption.study },
              ]}
            />
          </label>
          <p className="ui-set-note ui-set-t--meas">
            {VC.new.aup}
          </p>
          <div className="ui-vc-btns">
            <Button type="submit" variant="primary" name="intent" value="build">
              {VC.new.createBuild}
            </Button>
            <Button type="submit" variant="secondary" name="intent" value="save">
              {VC.new.createOnly}
            </Button>
          </div>
        </form>
      </PageBody>
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

/** The tab bar — server-rendered links verbatim (`?tab=` document navs; the strangler re-decides).
 *  `.ui-tabs-*` styles it like the kit's tab strip; `data-state` mirrors the active arm onto the
 *  same selector Radix uses (`aria-current` stays the semantic + the contract hook). */
function voiceTabBar(pid: string, active: string): ReactNode {
  return (
    <nav data-voice-tabs="true" aria-label={VC.nav} className="ui-tabs-list ui-vc-tabs">
      {VOICE_TABS.map((t) => (
        <a
          key={t}
          href={t === "overview" ? `/v/${pid}` : `/v/${pid}?tab=${t}`}
          data-voice-tab={t}
          data-state={active === t ? "active" : undefined}
          aria-current={active === t ? "page" : undefined}
          className="ui-tabs-trigger ui-vc-tab"
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
    <section data-facts-panel="true" className="ui-vc-card ui-vc-sec ui-set-t--meas">
      <h2 className="ui-set-h3">{VC.detail.factsHeading}</h2>
      <ul className="ui-vc-list ui-set-t">
        {panel.facts.map((f) => (
          <li key={f.key} data-fact={f.key} data-changed={f.changed ? "true" : "false"} className={f.changed ? undefined : "ui-set-t--m"}>
            <span className={f.changed ? "ui-vc-b" : undefined}>{f.label}</span>
            {" — "}
            {f.line}
          </li>
        ))}
      </ul>
      {panel.corpusWords.built != null ? (
        <p className="ui-set-note">
          {fmt(VC.detail.corpusLineFmt, {
            built: panel.corpusWords.built.toLocaleString("en-US"),
            current: panel.corpusWords.current.toLocaleString("en-US"),
          })}
          {panel.ageDays != null ? ` · ${fmt(VC.detail.ageFmt, { n: panel.ageDays })}` : ""}
        </p>
      ) : null}
      {plan?.route.sentence ? (
        <p data-update-route="true" className="ui-set-t--sm ui-set-t--m">
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
    <section data-gate-card="true" className="ui-vc-card ui-vc-card--acc ui-vc-sec ui-set-t--meas">
      <h2 className="ui-set-h2">{VC.detail.gateHeading}</h2>
      <p className="ui-set-t">{card.includedLine}</p>
      {card.exclusions.length > 0 ? (
        <>
          <p className="ui-set-t--sm ui-set-t--m">{VC.detail.gateExclusionsHeading}</p>
          <ul className="ui-set-list ui-set-t--sm ui-set-t--m">
            {card.exclusions.map((e) => (
              <li key={e.title}>
                {e.title} — {e.reason}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {card.holdoutLine ? (
        <p data-holdout-line="true" className="ui-set-t--sm ui-set-t--m">{card.holdoutLine}</p>
      ) : null}
      {card.calibrationWarning ? (
        <p data-calibration-warning="true" className="ui-set-t--sm ui-set-t--warn">{card.calibrationWarning}</p>
      ) : null}
      {card.estimate.credits != null ? (
        <p className="ui-set-note">
          {fmt(VC.detail.gateEstimateFmt, { n: card.estimate.credits, cap: card.estimate.capCredits ?? "—" })}
        </p>
      ) : null}
      {card.waitingUntil ? (
        <p data-gate-waiting="true" className="ui-set-t--sm ui-set-t--m">
          {fmt(VC.detail.gateWaitingFmt, { at: new Date(card.waitingUntil).toLocaleString("en-US", { timeZone: "UTC" }) })}
        </p>
      ) : null}
      <form method="post" action={`/v/${pid}/gates/${gate.gateId}`} className="ui-vc-btns">
        <HiddenField name="runId" value={gate.runId} />
        <Button type="submit" variant="primary" size="sm" name="action" value="approve" data-gate-approve="true">
          {VC.detail.gateApprove}
        </Button>
        <Button type="submit" variant="secondary" size="sm" name="action" value="wait">
          {VC.detail.gateWait}
        </Button>
        <Button type="submit" variant="danger" size="sm" name="action" value="stop">
          {VC.detail.gateStop}
        </Button>
      </form>
    </section>
  );
}

/** The §9.4 calibration table — pages.tsx `VoiceCalibrationTable` verbatim; the measure names
 *  humanize (`sentence_length` → "Sentence length"; the key stays on `data-calibration-row`). */
function VoiceCalibrationTable({ calibration }: { calibration: NonNullable<VoiceDetailDto["calibration"]> }): ReactNode {
  const t = VC.detail.calibrationTable;
  return (
    <section data-calibration="true" className="ui-vc-sec ui-set-t--meas">
      <h2 className="ui-set-h2">{VC.detail.calibrationHeading}</h2>
      {calibration.verdict ? (
        <p data-calibration-verdict={String(calibration.verdict)} className="ui-set-t--sm ui-set-t--m">
          {enumLabel(VC.detail.calibrationVerdict, String(calibration.verdict))}
          {" · "}
          {fmt(VC.detail.calibrationWithinFmt, { n: calibration.withinCount, total: calibration.totalCount })}
        </p>
      ) : null}
      <table className="ui-matrix ui-vc-w ui-set-t--sm">
        <thead>
          <tr>
            <th>{t.feature}</th>
            <th>{t.target}</th>
            <th>{t.prediction}</th>
            <th>{t.real}</th>
            <th>{t.band}</th>
          </tr>
        </thead>
        <tbody>
          {calibration.rows.map((r) => (
            <tr key={r.feature} data-calibration-row={r.feature} data-within-band={r.withinBand ? "true" : "false"}>
              <td>{humanizeKey(r.feature)}</td>
              <td>{r.target}</td>
              <td>{r.prediction ?? "—"}</td>
              <td>{r.actual}</td>
              <td className={r.withinBand ? "ui-set-t--ok" : "ui-set-t--warn"}>
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
 *  review checkbox keeps its REQ-VFY-6 `aria-label` on the Radix root; the provider name is the
 *  `providerLabel` map (D4 — `substack_export` renders "Substack export"). */
function VoiceSourceCard({ pid, conn, samples }: { pid: string; conn: VoiceConnectionDto; samples: readonly VoiceSampleDto[] }): ReactNode {
  const pending = samples.filter((s) => s.connection_id === conn.id && s.state === "new" && s.external_id);
  return (
    <li data-source={conn.id} data-provider={conn.provider} className="ui-vc-card">
      <div className="ui-set-form">
        <strong>{enumLabel(VC.detail.providerLabel, conn.provider)}</strong>
        <span className="ui-set-t--sm ui-set-t--m">{conn.handle ?? ""}</span>
        <span className="ui-vc-faint">
          {fmt(VC.detail.sourceItemsFmt, { included: String(conn.included), items: String(conn.items) })}
          {" · "}
          {conn.last_sync_at
            ? fmt(VC.detail.lastSyncFmt, { at: new Date(conn.last_sync_at).toLocaleString("en-US", { timeZone: "UTC" }) })
            : VC.detail.neverSynced}
        </span>
      </div>
      {conn.error ? (
        <p data-source-error="true" className="ui-set-t--sm ui-set-t--warn">{conn.error}</p>
      ) : null}
      <div className="ui-vc-btns">
        {conn.provider !== "upload" && conn.provider !== "paste" ? (
          <form method="post" action={`/v/${pid}/connections/${conn.id}/discover`}>
            <Button type="submit" variant="secondary" size="sm" data-discover="true">
              {VC.detail.discoverCta}
            </Button>
          </form>
        ) : null}
        <form method="post" action={`/v/${pid}/connections/${conn.id}/sync`}>
          <Button type="submit" variant="secondary" size="sm" data-resync="true">
            {VC.detail.resyncCta}
          </Button>
        </form>
        <form method="post" action={`/v/${pid}/connections/${conn.id}/remove`}>
          <Button type="submit" variant="danger" size="sm" data-remove-source="true">
            {VC.detail.removeSourceCta}
          </Button>
        </form>
      </div>
      {/* the per-source settings (§9.5 Settings): auto-include + daily auto-sync. */}
      <form method="post" action={`/v/${pid}/connections/${conn.id}/settings`} data-source-settings-form="true" className="ui-set-form ui-set-t--sm ui-set-t--m">
        <label className="ui-set-form">
          <Checkbox name="autoIncludeNew" defaultChecked={conn.auto_include_new !== false} aria-label={VC.detail.autoIncludeLabel} />
          {VC.detail.autoIncludeLabel}
        </label>
        <label className="ui-set-form">
          <Checkbox name="dailySync" defaultChecked={conn.schedule === "daily"} aria-label={VC.detail.dailySyncLabel} />
          {VC.detail.dailySyncLabel}
        </label>
        <Button type="submit" variant="ghost" size="sm">{VC.detail.saveSettingsCta}</Button>
      </form>
      {/* the review step: 'new' items wait for the confirm click — a checked box includes, an
          unchecked one omits, and nothing fetches before this posts (REQ-INGEST-4). */}
      {pending.length > 0 ? (
        <form method="post" action={`/v/${pid}/connections/${conn.id}/confirm`} data-confirm="true" className="ui-vc-ct">
          <ul className="ui-vc-list">
            {pending.map((s) => (
              <li key={s.id} data-review-item={s.external_id ?? s.id} className="ui-set-form ui-set-t--sm">
                <HiddenField name="known" value={s.external_id ?? ""} />
                <Checkbox name="include" value={s.external_id ?? ""} defaultChecked={s.access === "free"} aria-label={s.title ?? s.external_id ?? s.id} />
                <span className="ui-vc-grow">{s.title ?? s.external_id ?? s.id}</span>
                {s.access === "paywalled" ? (
                  <span className="ui-set-t--warn">{VC.detail.paywallBadge}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="ui-set-note">{VC.detail.confirmNote}</p>
          <Button type="submit" variant="primary" size="sm" data-confirm-cta="true">
            {VC.detail.confirmCta}
          </Button>
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
    <section data-sources="true" className="ui-vc-sec">
      <h2 className="ui-set-h2">{VC.detail.sourcesHeading}</h2>
      {conns.length === 0 ? (
        <p className="ui-set-t ui-set-t--m">{VC.detail.sourcesEmpty}</p>
      ) : (
        <>
          <ul className="ui-vc-list">
            {conns.map((cn) => (
              <VoiceSourceCard key={cn.id} pid={pid} conn={cn} samples={samples} />
            ))}
          </ul>
          <form method="post" action={`/v/${pid}/sync`} className="ui-vc-btns">
            <Button type="submit" variant="secondary" size="sm" data-resync-all="true">
              {VC.detail.resyncAllCta}
            </Button>
          </form>
        </>
      )}
      {/* the three link flows — no credential field exists anywhere (never-cookies, AC-I-B). */}
      <div className="ui-vc-list ui-vc-sec">
        <form method="post" action={`/v/${pid}/connections`} className="ui-set-form">
          <HiddenField name="provider" value="substack" />
          <label className="ui-vc-lab ui-vc-grow">
            {VC.detail.linkSubstackLabel}
            <TextField name="handle" placeholder={VC.detail.linkSubstackPlaceholder} />
          </label>
          <Button type="submit" variant="primary" size="sm" data-link-substack="true">{VC.detail.linkSubstackCta}</Button>
        </form>
        <form method="post" action={`/v/${pid}/connections`} className="ui-set-form">
          <HiddenField name="provider" value="url" />
          <label className="ui-vc-lab ui-vc-grow">
            {VC.detail.linkUrlLabel}
            <TextField name="url" type="url" placeholder={VC.urlPlaceholder} />
          </label>
          <Button type="submit" variant="primary" size="sm" data-link-url="true">{VC.detail.linkUrlCta}</Button>
        </form>
        <form method="post" action={`/v/${pid}/connections`} encType="multipart/form-data" className="ui-set-form">
          <HiddenField name="provider" value="substack_export" />
          <HiddenField name="quarantineKey" value="" />
          <label className="ui-vc-lab ui-vc-grow">
            {VC.detail.linkExportLabel}
            <TextField type="file" name="file" accept=".zip" />
          </label>
          <Button type="submit" variant="primary" size="sm" data-link-export="true">{VC.detail.linkExportCta}</Button>
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
    <section data-sample-drawer="true" className="ui-vc-card ui-vc-card--acc">
      <h2 className="ui-set-h2">
        {detail.item.title ?? VC.detail.drawerHeading}
      </h2>
      <p className="ui-set-t--sm ui-set-t--m">
        {enumLabel(VC.detail.stateBadge, detail.item.state)}
        {detail.item.access === "paywalled" ? ` · ${VC.detail.paywallBadge}` : ""}
        {quality ? ` · ${enumLabel(VC.detail.qualityBadge, quality)}` : ""}
        {detail.item.url ? <> · <a href={detail.item.url} className="ui-vc-acc">{detail.item.url}</a></> : null}
      </p>
      {notes.length > 0 ? (
        <div data-quality-notes="true">
          <h3 className="ui-set-h3">{VC.detail.qualityNotesHeading}</h3>
          <ul className="ui-set-list ui-set-t--sm ui-set-t--m">
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
        <div className="ui-vc-btns">
          <form method="post" action={`/v/${pid}/samples/${detail.item.id}/reconstruct`}>
            <HiddenField name="tier" value="text" />
            <Button type="submit" variant="secondary" size="sm" data-reconstruct-text="true">
              {VC.detail.reconstructTextCta}
            </Button>
          </form>
          {visualOffered ? (
            <form method="post" action={`/v/${pid}/samples/${detail.item.id}/reconstruct`}>
              <HiddenField name="tier" value="visual" />
              <Button type="submit" variant="secondary" size="sm" data-reconstruct-visual="true">
                {VC.detail.reconstructVisualCta}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
      <h3 className="ui-set-h3">{VC.detail.previewHeading}</h3>
      {detail.document ? (
        <pre data-sample-preview="true" className="ui-vc-pre ui-vc-pre--cap">
          {detail.document}
        </pre>
      ) : (
        <p className="ui-set-note">{VC.detail.noDocument}</p>
      )}
      {detail.versions.length > 0 ? (
        <>
          <h3 className="ui-set-h3">{VC.detail.versionsHeading}</h3>
          <ul data-sample-versions="true" className="ui-vc-list ui-set-t--sm ui-set-t--m">
            {detail.versions.map((v) => (
              <li key={v.id} data-version={v.n}>
                {fmt(VC.detail.versionFmt, { n: String(v.n), quality: v.quality != null ? enumLabel(VC.detail.qualityBadge, v.quality) : "—" })}
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
      <PageBody>
        <PageHeader title={d?.persona.display_name ?? ""} />
        {d?.persona.byline ? <p className="ui-set-t ui-set-t--m">{d.persona.byline}</p> : null}
        {d && d.members && d.members.length > 0 ? (
          <p data-composed-from="true" className="ui-set-t--sm ui-set-t--m">
            {fmt(VC.card.composedFmt, { names: d.members.map((m) => m.display_name ?? m.id).join(", ") })}
          </p>
        ) : null}
        <p data-voice-status="true" className="ui-set-t">
          {voicePillSpan(d?.status)}
          {voice?.estimate ? (
            <span className="ui-vc-faint ui-vc-tag">
              {fmt(VC.detail.estimateFmt, { n: voice.estimate.estimateCredits })}
            </span>
          ) : null}
        </p>
        {notice != null ? (
          <p role="status" className="ui-set-t ui-set-t--ok">{notice}</p>
        ) : null}
        {d ? (
          <>
            {voiceTabBar(pid, active)}

            {active === "overview" ? (
              <>
                {/* Build / update / cancel — the pill's ONE verb (§9.3).
                    P1.19 — §10.1 ✗: voice-building controls never render on phone width. */}
                {compact === true ? <PhoneBlockedNote /> : (
                  <div className="ui-vc-btns">
                    {d.status.action === "build" ? (
                      <form method="post" action={`/v/${pid}/build`}>
                        <Button type="submit" variant="primary" size="sm" data-build-voice="true">
                          {VC.detail.buildCta}
                        </Button>
                      </form>
                    ) : null}
                    {d.status.action === "update_voice" || d.status.action === "test" ? (
                      <form method="post" action={`/v/${pid}/update`}>
                        <Button type="submit" variant="primary" size="sm" data-update-voice="true">
                          {d.status.action === "test" ? VC.detail.testCta : VC.detail.updateCta}
                        </Button>
                      </form>
                    ) : null}
                    {d.upgradeRoute ? (
                      <form method="post" action={`/v/${pid}/update`}>
                        <HiddenField name="scope" value="full_from_quick" />
                        <Button type="submit" variant="secondary" size="sm" data-upgrade-voice="true">
                          {VC.detail.upgradeCta}
                        </Button>
                      </form>
                    ) : null}
                    {d.persona.active_run_id ? (
                      <form method="post" action={`/v/${pid}/cancel`}>
                        <HiddenField name="runId" value={d.persona.active_run_id} />
                        <Button type="submit" variant="secondary" size="sm">
                          {VC.detail.cancelRun}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                )}

                {d.gate ? <VoiceGateCardView pid={pid} gate={d.gate} /> : null}
                <VoiceFactsPanelView detail={d} plan={voice?.updatePlan} />

                {/* the Overview's hub paragraph — profile/index.md's head text when a build produced it. */}
                {d.hubMarkdown ? (
                  <section data-hub="true" className="ui-vc-sec ui-set-t--meas ui-set-t ui-vc-prewrap">
                    {d.hubMarkdown}
                  </section>
                ) : null}
                {holdout?.held && !holdout.revealed ? (
                  <p data-holdout-hidden="true" className="ui-set-t--sm ui-set-t--f">
                    {VC.detail.holdoutGeneric}
                  </p>
                ) : null}
                {d.projects.length > 0 ? (
                  <section data-projects="true" className="ui-vc-sec ui-set-t--meas">
                    <h2 className="ui-set-h3">{VC.detail.projectsHeading}</h2>
                    <ul className="ui-vc-list ui-set-t">
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
                  <section data-voice-delete="true" className="ui-set-sec ui-set-t--meas ui-vc-ct">
                    <h2 className="ui-set-h3 ui-set-t--warn">{VC.detail.deleteVoiceHeading}</h2>
                    <p className="ui-set-t--sm ui-set-t--m">{VC.detail.deleteVoiceNote}</p>
                    <form method="post" action={`/v/${pid}/delete`} className="ui-set-form">
                      {/* REQ-VFY-6 — aria-label the typed-confirm input (no hook/copy change). */}
                      <TextField name="confirm" placeholder={VC.detail.deletePlaceholder} aria-label={VC.detail.deleteVoiceHeading} className="ui-field--w" />
                      <Button type="submit" variant="danger" size="sm" data-delete-voice="true">
                        {VC.detail.deleteVoiceCta}
                      </Button>
                    </form>
                  </section>
                )}
              </>
            ) : null}

            {active === "description" ? (
              <>
                {/* the seed editor — plain markdown; on save the J9 hash recomputes and the pill flips live. */}
                <section data-seed-editor="true" className="ui-set-t--meas">
                  {d.persona.seed_authored_by === "persona_builder" ? (
                    <p data-agent-drafted="true" className="ui-set-t--sm ui-set-t--warn">
                      {VC.detail.agentDraftedMark}
                    </p>
                  ) : null}
                  {/* P1.19 — §10.1 ✗: seed edits are a voice-building control — suppressed on phone width. */}
                  {compact === true ? <PhoneBlockedNote /> : (
                    <form method="post" action={`/v/${pid}/seed`} className="ui-vc-form">
                      <label className="ui-vc-lab">
                        {VC.detail.bylineLabel}
                        <TextField name="byline" defaultValue={d.persona.byline ?? ""} />
                      </label>
                      <label className="ui-vc-lab">
                        {VC.detail.registersLabel}
                        <TextField name="registers" defaultValue={(d.persona.registers ?? []).join(", ")} />
                      </label>
                      {/* REQ-VFY-6 — the SSR's bare textarea has no programmatic name; aria-label
                          carries the section's heading word (no hook/copy change). */}
                      <TextArea name="description" defaultValue={d.seedMarkdown} aria-label={VC.detail.seedHeading} />
                      <Button type="submit" variant="primary" size="sm">
                        {VC.detail.seedSave}
                      </Button>
                    </form>
                  )}
                </section>

                {/* the corrections ledger (§9.4): a correction lands as a blockquote on the seed + a
                    consume-once row the next build picks up. */}
                <section data-corrections="true" className="ui-set-sec ui-set-t--meas">
                  <h2 className="ui-set-h2">{VC.detail.correctionsHeading}</h2>
                  {(d.corrections ?? []).length === 0 ? (
                    <p className="ui-set-t ui-set-t--m">{VC.detail.correctionsEmpty}</p>
                  ) : (
                    <ul className="ui-vc-list">
                      {(d.corrections ?? []).map((cr) => (
                        <li key={cr.id} data-correction={cr.id} data-consumed={cr.consumed_by_profile_id ? "true" : "false"} className="ui-vc-card">
                          <span>{cr.text}</span>
                          <span className="ui-vc-faint ui-vc-tag">
                            {cr.consumed_by_profile_id ? VC.detail.correctionConsumed : VC.detail.correctionPending}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {compact === true ? null : (
                    <form method="post" action={`/v/${pid}/corrections`} className="ui-vc-form">
                      <label className="ui-vc-lab">
                        {VC.detail.correctionLabel}
                        <TextArea name="text" required placeholder={VC.detail.correctionPlaceholder} />
                      </label>
                      <Button type="submit" variant="primary" size="sm">
                        {VC.detail.correctionCta}
                      </Button>
                    </form>
                  )}
                </section>

                {/* build notes — the last build's own notes (§9.4). */}
                {(d.buildNotes ?? []).length > 0 ? (
                  <section data-build-notes="true" className="ui-set-sec ui-set-t--meas">
                    <h2 className="ui-set-h2">{VC.detail.buildNotesHeading}</h2>
                    <ul className="ui-vc-list">
                      {(d.buildNotes ?? []).map((n) => (
                        <li key={n.id} data-build-note={n.id} className="ui-vc-card ui-vc-prewrap">
                          {typeof n.body === "string" ? n.body : JSON.stringify(n.body)}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            ) : null}

            {active === "samples" ? (
              <section data-samples="true" className="ui-set-t--meas">
                {/* P1.15 — the Sources pane: linked providers + the review-confirm step + the three
                    link flows + Re-sync all. P1.19 — §10.1 ✗: a building surface — hidden on phone. */}
                {compact === true ? null : (
                  <VoiceSourcesPane pid={pid} connections={voice?.connections} samples={d.samples} />
                )}
                {/* the open drawer — `?tab=samples&sample=<itemId>` (§9.5 preview/versions). */}
                {voice?.sampleDetail ? <VoiceSampleDrawer pid={pid} detail={voice.sampleDetail} compact={compact === true} /> : null}
                {d.samples.length === 0 ? (
                  <p className="ui-set-t ui-set-t--m">{VC.detail.samplesEmpty}</p>
                ) : (
                  <ul className="ui-vc-list">
                    {d.samples.map((s) => (
                      <li key={s.id} data-sample={s.id} className="ui-set-form ui-vc-card">
                        <a href={`/v/${pid}?tab=samples&sample=${encodeURIComponent(s.id)}`} data-sample-open={s.id} className="ui-vc-grow ui-vc-link">
                          {s.title ?? s.id}
                        </a>
                        {/* the hold-out badge shows ONLY post-reveal (§9.4) — pre-calibration the
                            identity stays server-side; the generic line is on Overview. */}
                        {holdout?.revealed && holdout.itemId === s.id ? (
                          <span data-holdout-badge="true" className="ui-vc-acc ui-set-t--sm">
                            {fmt(VC.detail.holdoutRevealedFmt, { title: s.title ?? s.id })}
                          </span>
                        ) : null}
                        {/* P1.15 — the item's ingest state + paywall + quality verdicts ride the row. */}
                        {s.state !== "included" ? (
                          <span data-sample-state={s.state} className="ui-vc-faint">
                            {enumLabel(VC.detail.stateBadge, s.state)}
                          </span>
                        ) : null}
                        {s.access === "paywalled" ? (
                          <span data-sample-paywalled="true" className="ui-set-t--sm ui-set-t--warn">{VC.detail.paywallBadge}</span>
                        ) : null}
                        {s.quality && s.quality !== "clean" ? (
                          <span data-sample-quality={s.quality} className="ui-set-t--sm ui-set-t--warn">
                            {enumLabel(VC.detail.qualityBadge, s.quality)}
                          </span>
                        ) : null}
                        <span className="ui-vc-faint">
                          {s.word_count != null ? `${s.word_count.toLocaleString("en-US")} w` : ""}
                        </span>
                        <a href={`/v/${pid}?tab=samples&sample=${encodeURIComponent(s.id)}`} className="ui-set-t--sm ui-vc-acc">
                          {VC.detail.viewLabel}
                        </a>
                        {compact === true ? null : (
                          <form method="post" action={`/v/${pid}/samples/${s.id}`}>
                            <Button type="submit" variant="ghost" size="sm" name="included" value={s.state === "included" ? "false" : "true"}>
                              {s.state === "included" ? VC.detail.omitLabel : VC.detail.includeLabel}
                            </Button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {compact === true ? null : (
                  <form method="post" action={`/v/${pid}/samples`} encType="multipart/form-data" data-samples-form="true" className="ui-vc-form ui-vc-sec">
                    <label className="ui-vc-lab">
                      {VC.detail.addSampleTitleLabel}
                      <TextField name="title" />
                    </label>
                    <label className="ui-vc-lab">
                      {VC.detail.addSampleLabel}
                      <TextArea name="text" />
                    </label>
                    <HiddenField name="quarantineKey" value="" />
                    <label className="ui-vc-lab">
                      {VC.detail.addSampleFileLabel}
                      <TextField type="file" name="file" accept=".md,.txt,.html" />
                    </label>
                    <Button type="submit" variant="primary" size="sm">
                      {VC.detail.addSampleCta}
                    </Button>
                  </form>
                )}
                {/* the fetcher-only URL path (REQ-INGEST-13) — the URL is fetched once, server-side. */}
                {compact === true ? null : (
                  <form method="post" action={`/v/${pid}/samples/url`} className="ui-vc-form ui-vc-sec">
                    <label className="ui-vc-lab">
                      {VC.detail.addSampleUrlLabel}
                      <TextField name="url" type="url" placeholder={VC.urlPlaceholder} />
                    </label>
                    <Button type="submit" variant="primary" size="sm" data-add-url="true">
                      {VC.detail.addUrlCta}
                    </Button>
                  </form>
                )}
              </section>
            ) : null}

            {active === "profile" ? (
              <>
                {d.snapshot ? (
                  <p className="ui-vc-faint">
                    {enumLabel(VC.card.tierLabel, d.snapshot.tier ?? "")} · {enumLabel(VC.detail.calibrationVerdict, d.snapshot.calibrationStatus ?? "") || "untested"}
                  </p>
                ) : (
                  <p className="ui-set-t ui-set-t--m">{VC.detail.profileEmpty}</p>
                )}
                {d.upgradeRoute && compact !== true ? (
                  <form method="post" action={`/v/${pid}/update`} className="ui-vc-btns">
                    <HiddenField name="scope" value="full_from_quick" />
                    <Button type="submit" variant="secondary" size="sm" data-upgrade-voice="true">
                      {VC.detail.upgradeCta}
                    </Button>
                  </form>
                ) : null}
                {d.calibration ? <VoiceCalibrationTable calibration={d.calibration} /> : null}
                {/* the Profile tab's fixed §9.4 order — calibration report first, collapsed sections
                    folded, the (Advanced) measures last-but-lexicon. */}
                <section data-profile-sections="true" className="ui-set-sec ui-set-t--meas">
                  <div className="ui-vc-list">
                    {(d.profileSections ?? []).map((sec) => {
                      const art = sec.path ? d.artifacts.find((a) => a.mirror_path === sec.path) : null;
                      const emptyPara = (
                        <p className="ui-set-note">{VC.detail.sectionEmpty}</p>
                      );
                      // Statement-shaped arms — the copy-containment scan keys on a `>…<` span, so
                      // each branch is a `return` (code tokens) rather than a bare ternary.
                      const inner = (() => {
                        if (sec.key === "voice-measures") {
                          if (!d.measures) return emptyPara;
                          return (
                            <pre data-voice-measures="true" className="ui-vc-prewrap ui-set-t--sm ui-set-t--m">
                              {JSON.stringify(d.measures.corpus, null, 0)}
                            </pre>
                          );
                        }
                        if (!art) return emptyPara;
                        return (
                          <p className="ui-set-t--sm ui-set-t--m">{art.mirror_path}</p>
                        );
                      })();
                      const body = (
                        <>
                          <h3 className="ui-set-h3">
                            {sec.key}
                            {sec.advanced ? <span className="ui-vc-faint"> {VC.detail.advancedTag}</span> : null}
                          </h3>
                          {inner}
                        </>
                      );
                      return sec.collapsed ? (
                        <details key={sec.key} data-profile-section={sec.key}>
                          <summary className="ui-vc-sum">{body}</summary>
                        </details>
                      ) : (
                        <section key={sec.key} data-profile-section={sec.key}>
                          {body}
                        </section>
                      );
                    })}
                  </div>
                </section>
                {/* derived profile artifacts — read-only by policy (§9.5 row 36; a write attempt 405s). */}
                <section data-artifacts="true" className="ui-set-sec ui-set-t--meas">
                  <h2 className="ui-set-h3">{VC.detail.artifactsHeading}</h2>
                  {d.artifacts.length === 0 ? (
                    <p className="ui-set-t ui-set-t--m">{VC.detail.artifactsEmpty}</p>
                  ) : (
                    <>
                      <p className="ui-set-note">{VC.detail.artifactsNote}</p>
                      <ul className="ui-vc-list ui-set-t">
                        {d.artifacts.map((a) => (
                          <li key={a.version_id} data-artifact-kind={a.kind}>
                            {a.mirror_path} · {humanizeKey(a.kind)}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              </>
            ) : null}

            {active === "runs" ? (
              <section data-runs="true" className="ui-set-t--meas">
                {d.runs.length === 0 ? (
                  <p className="ui-set-t ui-set-t--m">{VC.detail.runsEmpty}</p>
                ) : (
                  <ul className="ui-vc-list ui-set-t">
                    {d.runs.map((r) => (
                      <li key={r.id} data-run={r.id}>
                        {enumLabel(U.workflowLabels, r.workflow)} · {enumLabel(VC.detail.runStateLabel, r.state)} · {r.spent_credits} cr ·{" "}
                        {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                      </li>
                    ))}
                  </ul>
                )}
                {d.profiles.length > 0 ? (
                  <>
                    <h2 className="ui-set-h3 ui-vc-sec">{VC.detail.snapshotsHeading}</h2>
                    <ul className="ui-vc-list ui-set-t">
                      {d.profiles.map((p) => (
                        <li key={p.id} data-profile={p.id}>
                          {new Date(p.built_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} ·{" "}
                          {enumLabel(VC.card.tierLabel, p.tier ?? "")} ·{" "}
                          {enumLabel(VC.detail.calibrationVerdict, p.calibration_status ?? "")}
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
      </PageBody>
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
      <PageBody>
        <PageHeader
          title={VC.detail.reseedPreviewCta}
          crumbs={[{ label: slug, href: `/p/${slug}` }, { label: VC.detail.reseedPreviewCta }]}
        />
        {/* P1.19 — §10.1 ✗: diffs + voice-building actions never render on phone width. */}
        {compact === true ? <PhoneBlockedNote /> : null}
        {preview && compact !== true ? (
          <>
            {!preview.charterFound ? (
              <p className="ui-set-t ui-set-t--m">{VC.detail.reseedNoCharter}</p>
            ) : (
              <pre data-reseed-diff="true" className="ui-vc-diff">
                {preview.diff.map((l, i) => (
                  <div key={i} data-diff-kind={l.kind} className={l.kind === "added" ? "ui-set-t--ok" : l.kind === "removed" ? "ui-set-t--warn" : "ui-set-t--m"}>
                    {l.kind === "added" ? "+ " : l.kind === "removed" ? "- " : "  "}
                    {l.line}
                  </div>
                ))}
              </pre>
            )}
            <p data-guidance-preserved={preview.guidancePreserved ? "true" : "false"} className="ui-vc-faint">
              {preview.guidancePreserved ? VC.detail.reseedGuidanceKept : VC.detail.reseedGuidanceLost}
            </p>
            <form method="post" action={`/p/${slug}/voice/adopt`} className="ui-vc-btns">
              <Button type="submit" variant="primary" size="sm" name="reseed" value="true" data-adopt-reseed="true">
                {VC.detail.adoptReseedCta}
              </Button>
              <Button type="submit" variant="secondary" size="sm" name="reseed" value="false">
                {VC.detail.adoptCta}
              </Button>
            </form>
          </>
        ) : null}
      </PageBody>
    </div>
  );
}
