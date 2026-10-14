// SPA.14 — the `onboarding` surface (design/22 §2; design/25 app.new / app.newPreview /
// p.import / p.importPreview). Ports pages.tsx `NewProjectPage` / `ImportPage` /
// `ImportPreviewPage` verbatim — the same `<Shell>`/`<PageTitle>` chrome, the same
// `data-held-*` / `data-new-project-form` / `data-protocol-card` / `data-conversion-*`
// vocabulary — on data read through the BFF twins instead of `usePageData()`.
//
//   • /app/new* gates on `onboarding` alone; /p/:p/import* on `onboarding` AND `ide-chrome`
//     (server-ANDed into the boot verdict; the import leaves republish the twin's `ide` bag
//     onto the React chrome via `useIdeChromeData` — REQ-SEQ-12).
//   • mutations ride the shared dual-mode convention (wantsJson): delegated `onSubmit` on the
//     `data-spa-surface` wrapper collects the named controls + the clicked submitter BEFORE the
//     REQ-UX-16 busy pass; a `File` contribution runs presign→direct-PUT→`quarantineKey`
//     (REQ-BFF-16 — the BFF mints the signature, GCS takes the bytes, the JSON mutation carries
//     only the key + `fileName` for the source label).
//   • pending answers `{ok,pending:{pollAfterSeconds},redirect}` — the client navigates to the
//     server-owned poll URL; the preview leaf's `refetchInterval` re-asks at the SAME cadence
//     the SSR meta-refresh keeps (REQ-BFF-15, IMPORT_PREVIEW_POLL_SECONDS rides the payload).
//   • `{ok,data}` on /app/new paints the §5.3 ready preview inline (the document's POST-time
//     preview is non-addressable state too).
//   • ONB.1 — the held-draft contract verbatim: `getHold` hydrates the file input via
//     DataTransfer on EVERY mount (no claim-on-attach), `heldToken` rides only on a real attach,
//     deletion only on the token-matched `?hc=` echo (`data-held-consumed`) or Discard — the
//     hold-store seam is the ONE the landing island uses.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ConversionPreview,
  FilesPane,
  PageTitle,
  Shell,
  type IdeShellProps,
} from "@rhema/ui";
import type { PaletteData } from "@rhema/ide";
import type { PresignedImportDto } from "@rhema/api-client";
import { COPY } from "../../copy.js";
// The FilesPane label bag is the ONE pages.tsx renders — the SSR↔SPA parity seam lives outside
// the spa/ tree (the REQ-SAFE-10 leaf scan keys on `COPY.<leaf>` refs inside it).
import { filesLabels } from "../../files-labels.js";
import { BffError, bffFetch } from "../bff.js";
import { navigateDocument } from "../dom.js";
import { useIdeChromeData, type IdeChromeData } from "../ide/chrome-data.js";
import {
  HELD_DISCARD_CTA,
  HELD_DISCARDED_TEXT,
  deleteHold,
  getHold,
  heldReadyText,
  heldReattachText,
} from "../../client/hold-store.js";
import type {
  BffConversion,
  BffIdeBag,
  BffImportPreviewTwin,
  BffImportTwin,
  BffNewProjectPreviewTwin,
  BffNewProjectTwin,
  NewProjectPreviewSearch,
} from "../queries.js";

// ---- shared helpers (the local twins of pages.tsx's / voices.tsx's — one helper per renderer) --

/** `{key}`-template substitution — pages.tsx `fmt` verbatim. */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** ONB.1 — the converting-state copy pick, verbatim from pages.tsx `convertingCopy`. */
function convertingCopy(sourceLabel: string | undefined): string {
  if (sourceLabel && /\.(md|markdown|txt|html?|docx)$/i.test(sourceLabel)) return COPY.import.convertingFmt;
  if (sourceLabel && /\.pdf$/i.test(sourceLabel)) return COPY.import.convertingSlowFmt;
  return COPY.import.convertingUnknownFmt;
}

const textAreaStyle = {
  display: "block",
  marginTop: "4px",
  width: "100%",
  maxWidth: "560px",
  minHeight: "120px",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-bg)",
  color: "var(--shell-fg)",
  fontSize: "13px",
  fontFamily: "monospace",
  boxSizing: "border-box",
} as const;

const inputStyle = {
  display: "block",
  marginTop: "4px",
  width: "100%",
  maxWidth: "420px",
  padding: "6px 10px",
  borderRadius: "8px",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-bg)",
  color: "var(--shell-fg)",
  fontSize: "14px",
  boxSizing: "border-box",
} as const;

// ---- the shared mutation plumbing (voices.tsx's grammar, generalized) -------------------------

interface FormField {
  readonly name: string;
  readonly value: string | File;
}

/** `new FormData(form)`'s field grammar, collected explicitly BEFORE the busy pass. */
function collectFields(form: HTMLFormElement): FormField[] {
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

function foldField(json: Record<string, string | string[]>, name: string, value: string): void {
  const prev = json[name];
  if (prev === undefined) json[name] = value;
  else if (Array.isArray(prev)) prev.push(value);
  else json[name] = [prev, value];
}

/** REQ-UX-16's in-flight affordance — `aria-busy` on the form + disabled controls. */
function setFormBusy(form: HTMLFormElement, busy: boolean): void {
  if (busy) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
  for (const el of form.querySelectorAll("button, input, select, textarea")) {
    if (el instanceof HTMLElement && "disabled" in el) {
      (el as HTMLButtonElement).disabled = busy;
    }
  }
}

interface MutationReply {
  readonly ok?: boolean;
  readonly redirect?: string;
  readonly url?: string;
  readonly flash?: unknown;
  readonly data?: unknown;
  readonly pending?: { readonly pollAfterSeconds?: number };
}

interface FormPost {
  readonly form: HTMLFormElement;
  readonly action: string;
  readonly fields: readonly FormField[];
}

/** REQ-BFF-16 — mint → direct PUT → key; the JSON mutation never carries bytes. */
async function presignPut(f: File): Promise<string> {
  const pre = await bffFetch<PresignedImportDto>("/bff/import/presign", { method: "POST" });
  const put = await fetch(pre.url, {
    method: "PUT",
    headers: { ...pre.requiredHeaders },
    body: f,
  });
  if (!put.ok) throw new BffError(put.status, "upload_failed", { detail: `upload PUT ${put.status}` });
  return pre.key;
}

/**
 * The one onboarding-form submit handler — delegated `onSubmit` on the `data-spa-surface`
 * wrapper. `onData` gets `{ok,data}` payloads (the §5.3 inline preview); `onRedirect` gets the
 * envelope's `redirect` (defaults to in-router navigation); refusals land on `onRefusal`. The
 * `?hc=` consumed handshake is checked on every redirect: an echoed token matching THIS hold is
 * the server-confirmed consumption — `data-held-consumed` renders and the hold deletes (ONB.1).
 */
function useOnboardingSubmit(opts?: {
  readonly onData?: (data: unknown) => void;
  readonly onRedirect?: (href: string) => void;
  readonly onRefusal?: (detail: string) => void;
}): (e: FormEvent<HTMLElement>) => void {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutation = useMutation<MutationReply, unknown, FormPost>({
    mutationFn: async ({ action, fields }) => {
      const json: Record<string, string | string[]> = {};
      for (const f of fields) {
        if (f.value instanceof File) {
          const key = await presignPut(f.value);
          json["quarantineKey"] = key;
          json["fileName"] = f.value.name;
          continue;
        }
        foldField(json, f.name, f.value);
      }
      return bffFetch<MutationReply>(action, { method: "POST", json });
    },
    onMutate: ({ form }) => setFormBusy(form, true),
    onSuccess: (env) => {
      if (env.url != null) {
        navigateDocument(env.url);
        return;
      }
      if (env.data !== undefined) opts?.onData?.(env.data);
      if (env.redirect != null) {
        if (opts?.onRedirect) opts.onRedirect(env.redirect);
        else void router.navigate({ href: env.redirect });
      }
    },
    onError: (err) => {
      if (err instanceof BffError) opts?.onRefusal?.(err.detail ?? err.code);
    },
    onSettled: (_env, _err, vars) => {
      setFormBusy(vars.form, false);
      void queryClient.invalidateQueries({ queryKey: ["bff"] });
    },
  });
  return (e) => {
    e.preventDefault();
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.getAttribute("aria-busy") === "true") return;
    const action = form.getAttribute("action") ?? "";
    const fields = collectFields(form);
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

// ---- the §5.1 IDE-chrome publication (the SSR `ideContext` bag → IdeChromeData) -----------------

interface ImportShellData {
  readonly project: { readonly title: string; readonly pill: string; readonly slug: string };
  readonly paperTheme: string;
  readonly appTheme?: string;
  readonly ide: BffIdeBag;
}

/**
 * Publishes the twin's `ide` bag onto the React chrome for as long as the leaf is mounted —
 * the SSR `ideContext`'s fields verbatim: identity (projectId), theming, palette (its JSON
 * string parsed back to the typed `PaletteData`), panes that are data (findings/timeline/feed/
 * inbox/status), and `filesBody` built through the SAME `FilesPane` the SSR renders. `chat` is
 * the pane's own degrade state when absent (the seam is best-effort server-side too).
 */
function useImportChrome(shell: ImportShellData): void {
  const data = useMemo<IdeChromeData>(() => {
    let palette: PaletteData | undefined;
    try {
      palette = shell.ide.palette ? (JSON.parse(shell.ide.palette) as PaletteData) : undefined;
    } catch {
      palette = undefined;
    }
    const slug = shell.project.slug;
    return {
      projectId: shell.ide.projectId ?? slug,
      projectTitle: shell.project.title,
      projectPill: shell.project.pill,
      paperTheme: shell.paperTheme as IdeShellProps["paperTheme"],
      ...(shell.appTheme ? { appTheme: shell.appTheme as IdeShellProps["appTheme"] } : {}),
      ...(shell.ide.initialView ? { initialView: shell.ide.initialView } : {}),
      ...(shell.ide.sourceHref ? { sourceHref: shell.ide.sourceHref } : {}),
      ...(shell.ide.activeRun ? { activeRun: shell.ide.activeRun } : {}),
      ...(shell.ide.inboxCount != null ? { inboxCount: shell.ide.inboxCount } : {}),
      ...(shell.ide.findings ? { findings: shell.ide.findings } : {}),
      ...(shell.ide.timeline ? { timeline: shell.ide.timeline } : {}),
      ...(shell.ide.timelineView ? { timelineView: shell.ide.timelineView as IdeChromeData["timelineView"] } : {}),
      ...(shell.ide.feed ? { feed: shell.ide.feed } : {}),
      ...(shell.ide.runNextHref ? { runNextHref: shell.ide.runNextHref } : {}),
      ...(palette ? { palette } : {}),
      ...(shell.ide.paletteSearchUrl ? { paletteSearchUrl: shell.ide.paletteSearchUrl } : {}),
      ...(shell.ide.status ? { status: shell.ide.status } : {}),
      ...(shell.ide.files
        ? {
            filesBody: (
              <FilesPane
                sections={shell.ide.files.sections}
                hrefs={{
                  artifact: (id) => `/p/${slug}/a/${id}`,
                  draft: (n) => `/p/${slug}/v/${n}`,
                  run: (id) => `/p/${slug}/r/${id}`,
                }}
                labels={filesLabels}
              />
            ),
          }
        : {}),
    };
  }, [shell]);
  useIdeChromeData(data);
}

// ---- the §5.3 converting/pending section (shared by both preview legs) -------------------------

function ConvertingSection({ sourceLabel }: { sourceLabel: string }): ReactNode {
  return (
    <section style={{ maxWidth: "68ch" }} data-conversion-pending="true">
      <p role="status" style={{ color: "var(--shell-fg)", fontSize: "15px", lineHeight: 1.6 }}>
        {fmt(convertingCopy(sourceLabel), { name: sourceLabel })}
      </p>
      <p style={{ color: "var(--shell-fg-faint)", fontSize: "13px" }}>{COPY.import.convertingNote}</p>
    </section>
  );
}

// ---- `/app/new` — the new-project sheet ---------------------------------------------------------

interface PreviewState {
  readonly form: {
    readonly title: string;
    readonly protocolId: string | null;
    readonly venue: string | null;
    readonly personaId: string | null;
    readonly startVersion: number | null;
    readonly heldToken: string | null;
  };
  readonly preview: {
    readonly quarantineKey: string;
    readonly sourceLabel: string;
    readonly sourceText: string;
    readonly convertedMarkdown: string;
    readonly countLine: string;
    readonly warnings: readonly { readonly message: string; readonly blockId?: string | null }[];
  };
}

export function NewProjectSurface({
  newProject,
  entry,
  compact,
}: {
  newProject: BffNewProjectTwin["newProject"];
  entry: "scratch" | "outline" | "draft";
  compact: boolean;
}): ReactNode {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [notice, setNotice] = useState<{ text: string; discard: boolean } | null>(null);
  // The held token stamps only on a real DataTransfer attach and clears on Discard — kept as
  // state so the `value`-controlled hidden input survives re-renders (see the hydration effect).
  const [stampedToken, setStampedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inline, setInline] = useState<PreviewState | null>(null);
  const [consumed, setConsumed] = useState<string | null>(null);

  // ONB.1 — the hold claim: hydrate on EVERY mount while a hold exists; the record is never
  // touched by hydration (no claim-on-attach), `heldToken` rides only on a real DataTransfer
  // attach, Discard is the other writer. The effect is imperative over the uncontrolled inputs
  // — verbatim from the landing island's job 2.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rec = await getHold();
      if (!rec || cancelled) return;
      const form = formRef.current;
      const fileInput = form?.querySelector<HTMLInputElement>('input[name="file"]');
      const titleInput = form?.querySelector<HTMLInputElement>('input[name="title"]');
      let attached = false;
      if (fileInput) {
        try {
          const dt = new DataTransfer();
          dt.items.add(new File([rec.bytes], rec.name, { type: rec.type || "application/octet-stream" }));
          fileInput.files = dt.files;
          attached = fileInput.files.length === 1;
        } catch {
          attached = false;
        }
      }
      // The token rides as React state (the hidden input is `value`-controlled) — the landing
      // island stamps `.value` imperatively; the SPA must not, because a later re-render's
      // `defaultValue` pass rewrites the `value` attribute and would clobber the stamp.
      if (attached) setStampedToken(rec.token);
      if (titleInput && !titleInput.value) {
        titleInput.value = rec.name.replace(/\.[^.]+$/, "").slice(0, 120);
      }
      if (!cancelled) {
        setNotice({ text: attached ? heldReadyText(rec.name) : heldReattachText(rec.name), discard: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = useOnboardingSubmit({
    onData: (data) => {
      const d = data as PreviewState | undefined;
      if (d && typeof d === "object" && "preview" in d) setInline(d);
    },
    onRedirect: (href) => {
      // ONB.1 — the `?hc=` echo: a token matching THIS hold is the server-confirmed
      // consumption — the marker renders and the hold deletes before the router moves.
      const hc = new URLSearchParams(href.split("?")[1] ?? "").get("hc");
      if (hc) {
        void (async () => {
          const rec = await getHold();
          if (rec && rec.token === hc) await deleteHold();
        })();
        setConsumed(hc);
      }
      void router.navigate({ href });
    },
    onRefusal: (detail) => setError(detail),
  });

  const protocols = newProject.protocols ?? [];
  const voices = newProject.voices ?? [];
  const form = inline?.form ?? { title: "", protocolId: null, venue: null, personaId: null, startVersion: null, heldToken: null };
  const pickedCard = protocols.find((p) => p.id === form.protocolId) ?? null;
  const venueRows = pickedCard?.venueBar.table ?? protocols.flatMap((p) => p.venueBar.table);
  const cards = [
    { key: "scratch" as const, title: COPY.newProject.entryScratch, body: COPY.newProject.entryScratchNote },
    { key: "outline" as const, title: COPY.newProject.entryOutline, body: COPY.newProject.entryOutlineNote },
    { key: "draft" as const, title: COPY.newProject.entryDraft, body: COPY.newProject.entryDraftNote },
  ];

  const sheetShell = (children: ReactNode): ReactNode => (
    <Shell
      brand={COPY.brand}
      tagline={COPY.tagline}
      nav={<a href="/app" style={{ fontSize: "13px" }}>{COPY.newProject.backToApp}</a>}
      footer={<span>{COPY.footer}</span>}
    >
      {children}
    </Shell>
  );

  if (compact) {
    return sheetShell(
      <>
        <PageTitle>{COPY.newProject.heading}</PageTitle>
        <p data-phone-blocked="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", maxWidth: "68ch" }}>
          {COPY.phoneBlocked.note}
        </p>
      </>,
    );
  }

  return sheetShell(
    <div data-spa-surface onSubmit={onSubmit}>
      <PageTitle>{COPY.newProject.heading}</PageTitle>
      <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px", maxWidth: "68ch" }}>{COPY.newProject.lede}</p>
      {/* the consumed handshake marker — transient, rendered on the echo leg (ONB.1). */}
      {consumed ? <span data-held-consumed={consumed} hidden /> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", margin: "16px 0" }}>
        {cards.map((card) => (
          <a
            key={card.key}
            href={`/app/new?entry=${card.key}`}
            data-entry={card.key}
            onClick={(e) => {
              e.preventDefault();
              void router.navigate({ to: "/app/new", search: { entry: card.key } });
            }}
            style={{
              display: "block",
              padding: "12px 14px",
              borderRadius: "10px",
              border: `1px solid ${entry === card.key ? "var(--accent)" : "var(--shell-border)"}`,
              background: "var(--shell-surface)",
              textDecoration: "none",
              color: "var(--shell-fg)",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "14px" }}>{card.title}</div>
            <div style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "4px" }}>{card.body}</div>
          </a>
        ))}
      </div>
      {error ? (
        <p role="alert" style={{ color: "var(--sev-major)", fontSize: "13px" }}>{error}</p>
      ) : null}
      {inline ? (
        <ConversionPreview
          sourceLabel={inline.preview.sourceLabel}
          sourceText={inline.preview.sourceText}
          convertedMarkdown={inline.preview.convertedMarkdown}
          countLine={inline.preview.countLine}
          warnings={inline.preview.warnings}
          actions={{
            formAction: "/app/new/create",
            createLabel: COPY.import.createLabel,
            fixNowLabel: COPY.import.fixNowLabel,
            hiddenFields: {
              entry,
              title: form.title,
              ...(form.protocolId ? { protocolId: form.protocolId } : {}),
              ...(form.venue ? { venue: form.venue } : {}),
              ...(form.personaId ? { personaId: form.personaId } : {}),
              ...(form.startVersion != null ? { startVersion: String(form.startVersion) } : {}),
              ...(form.heldToken ? { heldToken: form.heldToken } : {}),
              qk: inline.preview.quarantineKey,
            },
          }}
          labels={{
            sourceHeading: COPY.import.sourceHeading,
            convertedHeading: COPY.import.convertedHeading,
            warningsHeading: COPY.import.warningsHeading,
            noWarnings: COPY.import.noWarnings,
            fixNowNote: COPY.import.fixNowNote,
          }}
        />
      ) : (
        <>
          <p data-held-notice role="status" style={{ fontSize: "13px", color: "var(--state-ready)" }}>
            {notice?.text ?? ""}
            {notice?.discard ? (
              <button
                type="button"
                data-held-discard="1"
                style={{ marginLeft: "10px", fontSize: "12px" }}
                onClick={() => {
                  void deleteHold().then(() => {
                    const form = formRef.current;
                    const fileInput = form?.querySelector<HTMLInputElement>('input[name="file"]');
                    try {
                      if (fileInput) fileInput.value = "";
                    } catch {
                      /* a cleared input is best-effort — the hold is gone either way */
                    }
                    setStampedToken(null);
                    setNotice({ text: HELD_DISCARDED_TEXT, discard: false });
                  });
                }}
              >
                {HELD_DISCARD_CTA}
              </button>
            ) : null}
          </p>
          <form method="post" action="/app/new" encType="multipart/form-data" data-held="1" data-new-project-form="true" style={{ maxWidth: "68ch" }} ref={formRef}>
            <input type="hidden" name="entry" value={entry} />
            <input type="hidden" name="heldToken" data-held-token value={stampedToken ?? form.heldToken ?? ""} readOnly />
            <label style={{ display: "block", fontSize: "13px", color: "var(--shell-fg-muted)" }}>
              {COPY.newProject.titleLabel}
              <input
                type="text"
                name="title"
                required={entry === "scratch"}
                defaultValue={form.title}
                placeholder={COPY.newProject.titlePlaceholder}
                style={inputStyle}
              />
            </label>
            <fieldset style={{ border: "none", padding: 0, margin: "16px 0 0" }}>
              <legend style={{ fontSize: "13px", color: "var(--shell-fg-muted)", padding: 0 }}>{COPY.newProject.protocolLegend}</legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginTop: "6px" }}>
                {protocols.map((p) => (
                  <label
                    key={p.id}
                    data-protocol-card={p.id}
                    style={{
                      display: "block",
                      padding: "10px 12px",
                      borderRadius: "10px",
                      border: `1px solid ${form.protocolId === p.id ? "var(--accent)" : "var(--shell-border)"}`,
                      background: "var(--shell-surface)",
                      cursor: "pointer",
                    }}
                  >
                    <input type="radio" name="protocolId" value={p.id} defaultChecked={form.protocolId === p.id} style={{ marginRight: "6px" }} />
                    <span style={{ fontWeight: 600, fontSize: "13px" }}>{p.name}</span>
                    <div style={{ fontSize: "12px", color: "var(--shell-fg-muted)", marginTop: "4px" }}>{p.tagline}</div>
                    <div style={{ fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "4px" }}>{p.holdYouTo}</div>
                    {p.typicalReviewCredits != null ? (
                      <div
                        className="tnum"
                        data-typical-words={p.typicalWords}
                        style={{ fontSize: "11px", color: "var(--shell-fg-faint)", marginTop: "4px" }}
                      >
                        {`Review ≈ ${p.typicalReviewCredits} credits`}
                        {p.typicalReviewDuration != null
                          ? ` · ~${p.typicalReviewDuration.lowMinutes}–${p.typicalReviewDuration.highMinutes} min`
                          : ""}
                      </div>
                    ) : null}
                  </label>
                ))}
              </div>
            </fieldset>
            <label style={{ display: "block", fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "16px" }}>
              {COPY.newProject.venueLabel}
              <input
                type="text"
                name="venue"
                list="np-venues"
                defaultValue={form.venue ?? ""}
                placeholder={COPY.newProject.venuePlaceholder}
                style={inputStyle}
              />
              <datalist id="np-venues">
                {venueRows.map((v) => (
                  <option key={v.venue} value={v.venue} />
                ))}
              </datalist>
              {(() => {
                const staleDates = [
                  ...new Set(
                    venueRows
                      .filter((v) => v.verified_at == null && v.as_of != null)
                      .map((v) => v.as_of as string),
                  ),
                ].sort();
                return staleDates.length > 0 ? (
                  <span data-venue-stale style={{ display: "block", fontSize: "12px", color: "var(--shell-fg-faint)", marginTop: "4px" }}>
                    {fmt(COPY.newProject.venueStaleFmt, { dates: staleDates.join(", ") })}
                  </span>
                ) : null;
              })()}
            </label>
            {pickedCard?.lengthNorms.default != null ? (
              <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }} className="tnum">
                {`${COPY.newProject.lengthLabel}: ${pickedCard.lengthNorms.default} ${pickedCard.lengthNorms.unit}`}
              </p>
            ) : null}
            <label style={{ display: "block", fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "16px" }}>
              {COPY.newProject.voiceLegend}
              <select name="personaId" defaultValue={form.personaId ?? ""} style={{ display: "block", marginTop: "4px", fontSize: "13px" }}>
                <option value="">{COPY.voice.picker.noVoice}</option>
                {voices.filter((v) => v.mode !== "house").length > 0 ? (
                  <optgroup label={COPY.newProject.voiceGroupYours}>
                    {voices
                      .filter((v) => v.mode !== "house")
                      .map((v) => (
                        <option key={v.personaId} value={v.personaId}>
                          {`${v.name ?? v.personaId} — ${v.status.pill.label}`}
                        </option>
                      ))}
                  </optgroup>
                ) : null}
                {voices.filter((v) => v.mode === "house").length > 0 ? (
                  <optgroup label={COPY.newProject.voiceGroupHouse}>
                    {voices
                      .filter((v) => v.mode === "house")
                      .map((v) => (
                        <option key={v.personaId} value={v.personaId}>
                          {`${v.name ?? v.personaId} — ${v.status.pill.label}`}
                        </option>
                      ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
            <p style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 0" }}>
              {COPY.newProject.voiceHintNeverBuilt}{" "}
              <a href="/voices/new" style={{ fontSize: "12px" }}>{COPY.voice.newCta}</a>
            </p>
            {entry === "draft" ? (
              <label style={{ display: "block", fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "16px" }}>
                {COPY.newProject.startVersionLabel}
                <input
                  type="number"
                  name="startVersion"
                  min={1}
                  defaultValue={form.startVersion != null ? String(form.startVersion) : ""}
                  style={{ display: "block", marginTop: "4px", width: "90px", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--shell-border)", background: "var(--shell-bg)", color: "var(--shell-fg)", fontSize: "13px" }}
                />
              </label>
            ) : null}
            {entry !== "scratch" ? (
              <>
                <label style={{ display: "block", fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "16px" }}>
                  {COPY.newProject.fileLabel}
                  <input type="file" name="file" accept=".md,.txt,.html,.docx,.pdf" style={{ display: "block", marginTop: "4px", color: "var(--shell-fg)" }} />
                </label>
                <label style={{ display: "block", fontSize: "13px", color: "var(--shell-fg-muted)", marginTop: "12px" }}>
                  {COPY.newProject.pasteLabel}
                  <textarea name="paste" style={textAreaStyle} />
                </label>
              </>
            ) : null}
            <div style={{ marginTop: "18px" }}>
              <button type="submit" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
                {entry === "scratch" ? COPY.newProject.createCta : COPY.newProject.continueCta}
              </button>
            </div>
          </form>
        </>
      )}
    </div>,
  );
}

// ---- `/app/new/preview` — the workspace-scoped poll leg -----------------------------------------

export function NewProjectPreviewSurface({
  twin,
  search,
  compact,
}: {
  twin: BffNewProjectPreviewTwin;
  search: NewProjectPreviewSearch;
  compact: boolean;
}): ReactNode {
  const router = useRouter();
  const entry = (search.entry === "scratch" || search.entry === "outline" || search.entry === "draft"
    ? search.entry
    : "draft") as "scratch" | "outline" | "draft";

  // The document's redirect legs (missing qk / failed read-back / empty title) — the twin
  // answers `{ok,redirect}`; the client navigates, never re-derives.
  useEffect(() => {
    if (twin.ok === true && twin.redirect) void router.navigate({ href: twin.redirect });
  }, [twin, router]);

  const onSubmit = useOnboardingSubmit({
    onRedirect: (href) => {
      const hc = new URLSearchParams(href.split("?")[1] ?? "").get("hc");
      if (hc) {
        void (async () => {
          const rec = await getHold();
          if (rec && rec.token === hc) await deleteHold();
        })();
      }
      void router.navigate({ href });
    },
  });

  if (compact) {
    return (
      <Shell brand={COPY.brand} tagline={COPY.tagline} nav={<a href="/app" style={{ fontSize: "13px" }}>{COPY.newProject.backToApp}</a>} footer={<span>{COPY.footer}</span>}>
        <PageTitle>{COPY.import.previewHeading}</PageTitle>
        <p data-phone-blocked="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", maxWidth: "68ch" }}>
          {COPY.phoneBlocked.note}
        </p>
      </Shell>
    );
  }

  const pv = twin.newProjectPreview;
  return (
    <Shell brand={COPY.brand} tagline={COPY.tagline} nav={<a href="/app" style={{ fontSize: "13px" }}>{COPY.newProject.backToApp}</a>} footer={<span>{COPY.footer}</span>}>
      <div data-spa-surface onSubmit={onSubmit}>
        <PageTitle>{COPY.import.previewHeading}</PageTitle>
        {pv?.status === "pending" ? <ConvertingSection sourceLabel={pv.sourceLabel} /> : null}
        {pv?.status === "ready" ? (
          <ConversionPreview
            sourceLabel={pv.sourceLabel}
            sourceText={pv.sourceText}
            convertedMarkdown={pv.convertedMarkdown}
            countLine={pv.countLine}
            warnings={pv.warnings}
            actions={{
              formAction: "/app/new/create",
              createLabel: COPY.import.createLabel,
              fixNowLabel: COPY.import.fixNowLabel,
              hiddenFields: {
                entry,
                title: pv.resolvedTitle,
                ...(search.protocolId ? { protocolId: search.protocolId } : {}),
                ...(search.venue ? { venue: search.venue } : {}),
                ...(search.personaId ? { personaId: search.personaId } : {}),
                ...(search.startVersion ? { startVersion: search.startVersion } : {}),
                ...(search.heldToken ? { heldToken: search.heldToken } : {}),
                qk: pv.quarantineKey,
              },
            }}
            labels={{
              sourceHeading: COPY.import.sourceHeading,
              convertedHeading: COPY.import.convertedHeading,
              warningsHeading: COPY.import.warningsHeading,
              noWarnings: COPY.import.noWarnings,
              fixNowNote: COPY.import.fixNowNote,
            }}
          />
        ) : null}
      </div>
    </Shell>
  );
}

// ---- `/p/:slug/import` — the import sheet (IDE-framed) -------------------------------------------

export function ImportSurface({
  data,
  compact,
}: {
  data: BffImportTwin["import"];
  compact: boolean;
}): ReactNode {
  useImportChrome(data);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const slug = data.project.slug;

  const onSubmit = useOnboardingSubmit({
    onData: (d) => {
      // `{ok,data:{conversion}}` — the ready preview the document paints on the POST; the leaf
      // keeps ONE render path: navigate to the poll URL (warm read-back answers ready at once).
      const conv = (d as { conversion?: BffConversion } | undefined)?.conversion;
      if (conv?.quarantineKey) {
        const src = conv.sourceLabel ?? "";
        void router.navigate({
          href: `/p/${slug}/import/preview?qk=${encodeURIComponent(conv.quarantineKey)}${src ? `&src=${encodeURIComponent(src)}` : ""}`,
        });
      }
    },
    onRefusal: (detail) => setError(detail),
  });

  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <PageTitle>{COPY.import.heading}</PageTitle>
      {compact ? (
        <p data-phone-blocked="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", maxWidth: "68ch" }}>
          {COPY.phoneBlocked.note}
        </p>
      ) : (
        <>
          <p style={{ color: "var(--shell-fg-muted)", fontSize: "14px", maxWidth: "68ch" }}>{COPY.import.lede}</p>
          {error ? (
            <p data-import-notice="failed" role="alert" style={{ fontSize: "12px", color: "var(--sev-major)", marginTop: "8px" }}>{error}</p>
          ) : null}
          <form method="post" action={`/p/${slug}/import/preview`} encType="multipart/form-data">
            <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block" }}>
              {COPY.import.fileLabel}
              <input type="file" name="file" accept=".md,.txt,.html,.docx,.pdf" style={{ display: "block", marginTop: "4px", color: "var(--shell-fg)" }} />
            </label>
            <label style={{ fontSize: "13px", color: "var(--shell-fg-muted)", display: "block", marginTop: "16px" }}>
              {COPY.import.pasteLabel}
              <textarea name="paste" style={textAreaStyle} />
            </label>
            <div style={{ marginTop: "16px" }}>
              <button type="submit" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "var(--shell-bg)", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
                {COPY.import.convertCta}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

// ---- `/p/:slug/import/preview` — the project-scoped poll leg (IDE-framed) -------------------------

export function ImportPreviewSurface({
  data,
  compact,
}: {
  data: NonNullable<BffImportPreviewTwin["importPreview"]>;
  compact: boolean;
}): ReactNode {
  const { conversion } = data;
  useImportChrome(data);
  const router = useRouter();
  const slug = conversion.projectSlug;

  const onSubmit = useOnboardingSubmit({
    onRedirect: (href) => void router.navigate({ href }),
  });

  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <PageTitle>{COPY.import.previewHeading}</PageTitle>
      {compact ? (
        <p data-phone-blocked="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", maxWidth: "68ch" }}>
          {COPY.phoneBlocked.note}
        </p>
      ) : (
        <>
          {conversion.created ? (
            <p role="status" style={{ color: "var(--state-ready)", fontSize: "13px" }}>
              {COPY.import.created}
            </p>
          ) : null}
          {conversion.pending === true ? (
            <ConvertingSection sourceLabel={conversion.sourceLabel} />
          ) : null}
          {conversion.pending !== true ? (
            <ConversionPreview
              sourceLabel={conversion.sourceLabel}
              sourceText={conversion.sourceText}
              convertedMarkdown={conversion.convertedMarkdown}
              countLine={conversion.countLine}
              warnings={conversion.warnings}
              actions={{
                formAction: `/p/${slug}/import/create`,
                createLabel: COPY.import.createLabel,
                fixNowLabel: COPY.import.fixNowLabel,
                ...(conversion.quarantineKey ? { hiddenFields: { qk: conversion.quarantineKey } } : {}),
              }}
              labels={{
                sourceHeading: COPY.import.sourceHeading,
                convertedHeading: COPY.import.convertedHeading,
                warningsHeading: COPY.import.warningsHeading,
                noWarnings: COPY.import.noWarnings,
                fixNowNote: COPY.import.fixNowNote,
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
