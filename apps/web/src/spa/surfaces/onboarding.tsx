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
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  ConversionPreview,
  PageTitle,
  TextArea,
} from "@rhema/ui";
import type { PresignedImportDto } from "@rhema/api-client";
import { COPY } from "../../copy.js";
import { PageBody, PageHeader } from "../page-header.js";
import { BffError, bffFetch } from "../bff.js";
import { errorMessage } from "../../error-copy.js";
import { navigateDocument } from "../dom.js";
import { useShellChrome } from "../ide/chrome-data.js";
import {
  HELD_DISCARD_CTA,
  deleteHold,
  getHold,
  heldReadyText,
  heldReattachText,
} from "../../client/hold-store.js";
import type {
  BffConversion,
  BffImportPreviewTwin,
  BffImportTwin,
  BffNewProjectPreviewTwin,
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

// ---- REQ-HOME-5 — the styled, keyboard-accessible dropzone replacing the native file input ------
// The real `<input type="file" name="file">` stays mounted visually-hidden so `collectFields` and
// the no-JS form path keep working; the region is a `role="button"` — Tab-focusable, Enter/Space
// opens the picker, and a drop assigns `input.files` via DataTransfer (the hold-store's precedent).

function FileDropzone({ compact }: { readonly compact?: boolean }): ReactNode {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const accept = ".md,.txt,.html,.docx,.pdf";

  const assign = (files: FileList | null) => {
    const input = inputRef.current;
    if (!input || !files || files.length === 0) return;
    const dt = new DataTransfer();
    dt.items.add(files[0]!);
    input.files = dt.files;
    setSelected(files[0]!.name);
  };

  return (
    <div className="ui-rs-mt">
      <div
        role="button"
        tabIndex={0}
        data-import-dropzone
        aria-label={COPY.import.dropzoneLabel}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          assign(e.dataTransfer.files);
        }}
        className={`ui-ob-drop${compact ? " ui-ob-drop--full" : ""}${over ? " ui-ob-drop--over" : ""}`}
      >
        {selected ? fmt(COPY.import.dropzoneSelectedFmt, { name: selected }) : COPY.import.dropzoneLabel}
        <span className="ui-set-note ui-set-t--f ui-ob-sub">
          {COPY.import.dropzoneFormats}
        </span>
      </div>
      {/* GUARD-1 exemption (FileDropzone): the visually-hidden file proxy the dropzone drives via
          DataTransfer — the styled dropzone (role=button) is the accessible control (RV-36). */}
      <input
        ref={inputRef}
        type="file"
        name="file"
        accept={accept}
        data-import-file-input
        // the dropzone (role=button + aria-label) is the accessible control; this is its proxy.
        aria-hidden="true"
        tabIndex={-1}
        className="ui-visually-hidden"
        onChange={(e) => setSelected(e.currentTarget.files?.[0]?.name ?? null)}
      />
    </div>
  );
}

/**
 * The no-JS form grammar's hidden carrier — GUARD-1's named exemption owns this one component
 * (the held-draft `heldToken` id rides a raw input; the visible controls are primitives, RV-36).
 */
function HiddenField({
  name,
  value,
  ...rest
}: {
  readonly name: string;
  readonly value: string;
} & Record<`data-${string}`, string | undefined>): ReactNode {
  return <input type="hidden" name={name} value={value} {...rest} />;
}

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
  // fetch resolves on headers — drain the body so Chromium closes the request entry; an
  // unconsumed body stays pending until the next document nav aborts it (live: the
  // requestfailed sweep flagged ERR_ABORTED on PUTs whose bytes had landed).
  await put.arrayBuffer().catch(() => new ArrayBuffer(0));
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
      if (err instanceof BffError) opts?.onRefusal?.(errorMessage(err));
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

// ---- the §5.1 IDE-chrome publication — SPA.17 hoisted the shell→IdeChromeData mapper onto the
// shared seam (`useShellChrome` in ../ide/chrome-data.js); the import leaves publish the twin's
// `ide` bag through it verbatim (REQ-SEQ-12). ----------------------------------------------------

// ---- the §5.3 converting/pending section (shared by both preview legs) -------------------------

function ConvertingSection({ sourceLabel }: { sourceLabel: string }): ReactNode {
  return (
    <section className="ui-set-t--meas" data-conversion-pending="true">
      <p role="status" className="ui-set-t ui-rs-lead">
        {fmt(convertingCopy(sourceLabel), { name: sourceLabel })}
      </p>
      <p className="ui-set-t ui-set-t--f">{COPY.import.convertingNote}</p>
    </section>
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
      <PageBody>
        <div data-spa-surface>
          <PageHeader title={COPY.import.previewHeading} />
        <p data-phone-blocked="true" className="ui-set-t ui-set-t--m ui-set-t--meas">
          {COPY.phoneBlocked.note}
        </p>
        </div>
      </PageBody>
    );
  }

  const pv = twin.newProjectPreview;
  return (
    <PageBody>
      <div data-spa-surface onSubmit={onSubmit}>
        <PageHeader title={COPY.import.previewHeading} />
        {pv?.status === "pending" ? <ConvertingSection sourceLabel={pv.sourceLabel} /> : null}
        {pv?.status === "ready" ? (
          <ConversionPreview
            sourceLabel={pv.sourceLabel}
            sourceText={pv.sourceText}
            convertedMarkdown={pv.convertedMarkdown}
            {...(pv.title ? { title: pv.title } : {})}
            countLine={pv.countLine}
            warnings={pv.warnings}
            actions={{
              formAction: "/app/new/create",
              createLabel: COPY.import.createLabel,
              createCleanLabel: COPY.import.createCleanLabel,
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
    </PageBody>
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
  useShellChrome(data);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const slug = data.project.slug;

  // ONB.1 (R7HOME.2b) — the held-draft contract's new home: a landing drop that survived sign-in
  // lands here (`/app/new?held=1` → blank create → this surface) and hydrates on EVERY mount
  // while a hold exists (no claim-on-attach); `heldToken` rides only on a real DataTransfer
  // attach, Discard is the other writer, and a confirmed preview submit deletes the hold.
  const formRef = useRef<HTMLFormElement | null>(null);
  const [stampedToken, setStampedToken] = useState<string | null>(null);
  const [heldNotice, setHeldNotice] = useState<{ text: string } | null>(null);
  const stampedRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rec = await getHold();
      if (!rec || cancelled) return;
      const fileInput = formRef.current?.querySelector<HTMLInputElement>('input[name="file"]');
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
      if (attached) {
        stampedRef.current = rec.token;
        setStampedToken(rec.token);
      }
      if (!cancelled) setHeldNotice({ text: attached ? heldReadyText(rec.name) : heldReattachText(rec.name) });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = useOnboardingSubmit({
    onData: (d) => {
      // `{ok,data:{conversion}}` — the ready preview the document paints on the POST; the leaf
      // keeps ONE render path: navigate to the poll URL (warm read-back answers ready at once).
      // A submitted held file is server-confirmed consumption (the server holds the bytes in
      // quarantine) — the hold deletes before the router moves.
      if (stampedRef.current) void deleteHold();
      const conv = (d as { conversion?: BffConversion } | undefined)?.conversion;
      if (conv?.quarantineKey) {
        const src = conv.sourceLabel ?? "";
        void router.navigate({
          href: `/p/${slug}/import/preview?qk=${encodeURIComponent(conv.quarantineKey)}${src ? `&src=${encodeURIComponent(src)}` : ""}`,
        });
      }
    },
    onRedirect: (href) => {
      if (stampedRef.current) void deleteHold();
      void router.navigate({ href });
    },
    onRefusal: (detail) => setError(detail),
  });

  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <PageTitle>{COPY.import.heading}</PageTitle>
      {compact ? (
        <p data-phone-blocked="true" className="ui-set-t ui-set-t--m ui-set-t--meas">
          {COPY.phoneBlocked.note}
        </p>
      ) : (
        <>
          <p className="ui-set-t ui-set-t--m ui-set-t--meas">{COPY.import.lede}</p>
          {error ? (
            <p data-import-notice="failed" role="alert" className="ui-set-note ui-set-t--warn">{error}</p>
          ) : null}
          {heldNotice ? (
            <p data-held-notice="true" className="ui-set-t ui-set-t--m ui-rs-mt">
              {heldNotice.text}{" "}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-held-discard="true"
                onClick={() => {
                  void deleteHold().then(() => {
                    const input = formRef.current?.querySelector<HTMLInputElement>('input[name="file"]');
                    if (input) input.value = "";
                    stampedRef.current = null;
                    setStampedToken(null);
                    setHeldNotice(null);
                  });
                }}
              >
                {HELD_DISCARD_CTA}
              </Button>
            </p>
          ) : null}
          <form ref={formRef} method="post" action={`/p/${slug}/import/preview`} encType="multipart/form-data">
            {stampedToken ? <HiddenField name="heldToken" data-held-token="true" value={stampedToken} /> : null}
            <div>
              <span className="ui-set-t--m">{COPY.import.fileLabel}</span>
              <FileDropzone />
            </div>
            <label className="ui-vc-lab ui-rs-mt">
              {COPY.import.pasteLabel}
              <TextArea name="paste" className="ui-field--mono ui-rs-mt" aria-label={COPY.import.pasteLabel} />
            </label>
            <div className="ui-rs-mt">
              <Button type="submit" variant="primary">
                {COPY.import.convertCta}
              </Button>
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
  useShellChrome(data);
  const router = useRouter();
  const slug = conversion.projectSlug;

  const onSubmit = useOnboardingSubmit({
    onRedirect: (href) => void router.navigate({ href }),
  });

  return (
    <div data-spa-surface onSubmit={onSubmit}>
      <PageHeader title={COPY.import.previewHeading} />
      {compact ? (
        <p data-phone-blocked="true" className="ui-set-t ui-set-t--m ui-set-t--meas">
          {COPY.phoneBlocked.note}
        </p>
      ) : (
        <>
          {conversion.created ? (
            <p role="status" className="ui-set-t ui-set-t--ok">
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
              {...(conversion.title ? { title: conversion.title } : {})}
              countLine={conversion.countLine}
              warnings={conversion.warnings}
              actions={{
                formAction: `/p/${slug}/import/create`,
                createLabel: COPY.import.createLabel,
                createCleanLabel: COPY.import.createCleanLabel,
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
