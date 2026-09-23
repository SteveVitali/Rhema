// The persistence seam (P1.02 item 11 — "do not fork it"). The Page autosaves through whatever
// `EditorTransport` is bound — today the HTTP save path over the beta editor routes; P1.03 swaps in
// the Yjs/Hocuspocus transport without touching the editor. The seam is deliberately narrow: load the
// doc, push a markdown update, expose the §6.3 run lock. Everything else (projections, provenance
// rows, Guidance capture, fork-on-frozen) stays server-side.

export interface EditorLock {
  readonly runId: string;
  readonly kind: "writer" | "reader";
  readonly workflow: string;
}

export interface EditorFinding {
  readonly findingId: string;
  readonly title: string;
  readonly severity: string;
  readonly sourceLabel: string;
  readonly anchor: {
    readonly blockId: string;
    readonly quote: string;
    readonly startOffset: number;
    readonly endOffset: number;
    readonly confidence: number;
    readonly unanchored?: true;
  } | null;
  readonly method: "exact" | "normalized" | "fuzzy" | "unresolved" | "unanchored";
  readonly lost: boolean;
}

/** A CSL-JSON item minus the wire noise — enough to resolve `[@key]` and render the cite chip. */
export interface BibliographyItem {
  readonly citeKey: string;
  readonly item: Record<string, unknown>;
}

export interface PageDoc {
  readonly draftId: string;
  readonly draftN: number;
  readonly origin: string;
  readonly state: string;
  readonly baseDraftId: string | null;
  readonly baseDraftN: number | null;
  readonly markdown: string;
  readonly sha256: string | null;
  readonly lock: EditorLock | null;
  readonly findings: readonly EditorFinding[];
  /** the stored block-level provenance map `{blockId → source kind}` for the Authorship overlay. */
  readonly provenance?: Readonly<Record<string, string>> | null;
  /** the project's CSL-JSON bibliography (cite resolution + dangling-key rendering). */
  readonly bibliography?: readonly BibliographyItem[];
  /** the REQ-PROD-14 venue-cap string the status bar shows (e.g. "+212 over WaPo"), if computable. */
  readonly venueCap?: string | null;
}

export interface PageSaveResult {
  readonly draftId: string;
  readonly draftN: number;
  readonly versionId: string;
  readonly sha256: string;
  /** true ⇒ this save forked v(N+1) on a frozen head — the banner + projections follow. */
  readonly forked: boolean;
  readonly changed: boolean;
  readonly restorePointId: string | null;
  readonly sync: "synced";
}

export interface PageSaveMeta {
  /** the block-level provenance span set captured live (`{blockId → source}` rows). */
  readonly provenanceSpans?: readonly { blockId: string; source: unknown }[];
  /** agent-origin span captures — write-only REQ-POS-9 rows for 1.x rendering. */
  readonly agentSpans?: readonly { blockId: string; from: number; to: number }[];
}

/**
 * The narrow seam both transports implement. `save` takes canonical markdown + the sidecar captures;
 * `poll` refreshes the lock + projected findings; `note`/`cancelRun` are the §6.3 affordances.
 */
export interface EditorTransport {
  load(): Promise<PageDoc>;
  save(markdown: string, meta?: PageSaveMeta): Promise<PageSaveResult>;
  /** the lock/doc poll (the client's interval refresh). Same DTO as load. */
  poll(): Promise<PageDoc>;
  /** a comment while locked → a Guidance row (REQ-DATA-41). */
  postNote(text: string): Promise<{ guidanceId: string }>;
  /** "Cancel run to edit" — releases a held lock. */
  cancelRun(): Promise<void>;
}

/** Same-origin HTTP transport over the existing `/p/:project/…` JSON routes (the PRB.07 seam). */
export function httpTransport(urls: {
  doc: string;
  save: string;
  note: string;
  cancel: string;
}): EditorTransport {
  const get = async (url: string): Promise<PageDoc> => {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`doc fetch ${r.status}`);
    return (await r.json()) as PageDoc;
  };
  return {
    load: () => get(urls.doc),
    poll: () => get(urls.doc),
    async save(markdown, meta) {
      const r = await fetch(urls.save, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markdown, ...(meta ?? {}) }),
      });
      if (r.status === 409) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        const e = new Error(body.error ?? "locked") as Error & { status?: number };
        e.status = 409;
        throw e;
      }
      if (!r.ok) throw new Error(`save ${r.status}`);
      return (await r.json()) as PageSaveResult;
    },
    async postNote(text) {
      const r = await fetch(urls.note, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error(`note ${r.status}`);
      return (await r.json()) as { guidanceId: string };
    },
    async cancelRun() {
      await fetch(urls.cancel, { method: "POST" }).catch(() => undefined);
    },
  };
}
