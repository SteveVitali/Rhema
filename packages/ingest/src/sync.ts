// The ingestion sync engine (REQ-INGEST-3/4/5/6/9/11; AC-I-A). One pure orchestration pass per
// connection: DISCOVER (no bodies) → DIFF on external_id → CONDITIONAL RE-FETCH (change-key miss or
// keyless) → hash-compare → write a new Sample version ONLY when the normalized body hash changed.
//
// Invariants enforced here (the provider interface alone can't):
//   - discovery never fetches bodies: discover gets the paced fetch port and providers are
//     contractually body-free; tests instrument the port to assert ZERO body-endpoint calls.
//   - fetch only what the user included: 'new'/'omitted' items are never fetched; paywalled items
//     are never fetched (and the substack provider refuses them too — belt and suspenders).
//   - removed_remote retains bytes: the item's last-good version and raw bytes survive — only the
//     state badge changes.
//   - provider errors surface verbatim with a remedy line, never swallowed.
//   - last good version stays: a fetch/convert failure leaves current_sample_id untouched.

import { sha256Hex } from "@rhema/contracts";
import { canonicalSampleMarkdown } from "./canonical.js";
import type { ImageDeps } from "./canonical.js";
import type {
  BlobPort,
  ConnectionRef,
  ConvertPort,
  DiscoveredDraft,
  FetchPort,
  Provider,
  ProviderError,
} from "./types.js";
import { urlChangeKey } from "./providers/url.js";

/** The persisted-item projection the engine diffs against (the worker binds this to Drizzle). */
export interface ExistingItem {
  readonly id: string;
  readonly externalId: string | null;
  readonly state: string;
  readonly remoteChangeKey: string | null;
  readonly currentSampleId: string | null;
  /** The head version's normalized-body hash — the AC-I-A comparator. */
  readonly contentSha256: string | null;
  readonly access: string | null;
  readonly url: string | null;
  readonly title: string | null;
}

export interface WriteSampleArgs {
  /** The full canonical document (front-matter + normalized body). */
  readonly document: string;
  readonly contentSha256: string;
  readonly originalSha256: string;
  readonly quality: string;
  readonly qualityNotes: readonly string[];
  readonly wordCount: number;
  /** Raw original bytes retained beside the artifact (the preview's raw side + re-convert input). */
  readonly originalBytes?: Uint8Array;
}

export interface SyncStore {
  listItems(connectionId: string): Promise<ExistingItem[]>;
  createItem(connectionId: string, draft: DiscoveredDraft, state: string): Promise<ExistingItem>;
  setItemState(itemId: string, state: string): Promise<void>;
  setRemoteChangeKey(itemId: string, key: string | null): Promise<void>;
  /** Refresh the listing fields a provider reported (title/url/date/words/access). */
  setItemMeta(
    itemId: string,
    meta: Pick<DiscoveredDraft, "title" | "url" | "date" | "wordCount" | "access">,
  ): Promise<void>;
  nextVersionN(itemId: string): Promise<number>;
  writeSample(itemId: string, n: number, sample: WriteSampleArgs): Promise<void>;
  setConnectionError(connectionId: string, error: string | null): Promise<void>;
  setConnectionSynced(connectionId: string, at: Date): Promise<void>;
}

export interface SyncDeps {
  readonly fetch: FetchPort;
  readonly blobs?: BlobPort;
  readonly convert: ConvertPort;
  readonly store: SyncStore;
  readonly images?: ImageDeps;
  readonly now?: () => Date;
  readonly newId?: () => string;
  /** Injectable sleep for the pacing wrapper (tests pass a no-op). */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Minimum ms between fetches to the same host — client-side politeness on top of the fetcher
   *  service's ≤1 req/s/host. Default 1100ms; tests pass 0. */
  readonly minFetchIntervalMs?: number;
}

export interface SyncError {
  readonly itemId: string | null;
  readonly message: string;
  readonly remedy: string;
}

export interface SyncReport {
  readonly connectionId: string;
  readonly discovered: number;
  readonly added: number;
  readonly removedRemote: number;
  readonly changed: number;
  readonly newVersions: number;
  readonly skippedUnchanged: number;
  readonly errors: readonly SyncError[];
}

const nowOf = (deps: SyncDeps): Date => deps.now?.() ?? new Date();

export interface PaceOptions {
  readonly minFetchIntervalMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => Date;
}

/** Wrap a fetch port with per-host pacing (≤1 req/min-interval) — politeness INSIDE the provider
 *  calls so discovery pagination and body fetches both ride it. */
export function pacedFetchPort(fetch: FetchPort, opts: PaceOptions): FetchPort {
  const minMs = opts.minFetchIntervalMs ?? 1100;
  if (minMs <= 0) return fetch;
  const last = new Map<string, number>();
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => new Date());
  return {
    async get(url, getOpts) {
      let host = "";
      try {
        host = new URL(url).host;
      } catch {
        host = url;
      }
      const prev = last.get(host) ?? 0;
      const wait = prev + minMs - now().getTime();
      if (wait > 0) await sleep(wait);
      last.set(host, now().getTime());
      return fetch.get(url, getOpts);
    },
  };
}

function itemError(err: ProviderError, itemId: string | null): SyncError {
  return { itemId, message: err.message, remedy: err.remedy };
}

/** The default state for a newly discovered item (REQ-INGEST-4 + §9.5 settings): paid/unknown land
 *  omitted (nothing to fetch / export CTA); free lands `included` when the connection's policy says
 *  so, else `new` awaiting the confirm step. Auto-sync NEVER auto-includes — the caller sets
 *  `autoIncludeNew: false` on the connection for auto passes... actually the flag IS the per-
 *  connection setting; the auto-sync schedule never creates connections, it only re-runs sync on
 *  existing ones, and REQ-INGEST-7 says auto-sync never auto-includes → the engine forces `new`
 *  when `auto` is true regardless of the flag. */
function defaultState(draft: DiscoveredDraft, conn: ConnectionRef, auto: boolean): string {
  if (draft.access === "paywalled" || draft.access === "unknown") return "omitted";
  if (auto) return "new"; // REQ-INGEST-7: auto-sync never auto-includes
  return conn.autoIncludeNew ? "included" : "new";
}

export async function syncConnection(
  conn: ConnectionRef,
  provider: Provider,
  deps: SyncDeps,
  opts?: { readonly auto?: boolean },
): Promise<SyncReport> {
  const auto = opts?.auto ?? false;
  const store = deps.store;
  const paced = pacedFetchPort(deps.fetch, deps);
  const pdeps = { fetch: paced, blobs: deps.blobs, now: deps.now };
  const errors: SyncError[] = [];
  let discovered: DiscoveredDraft[];
  try {
    discovered = await provider.discover(conn, pdeps);
  } catch (e) {
    const pe = (e ?? {}) as Partial<ProviderError>;
    const error: SyncError = {
      itemId: null,
      message: typeof pe.message === "string" ? pe.message : String(e),
      remedy: typeof pe.remedy === "string" ? pe.remedy : "Retry the sync",
    };
    // Verbatim message + remedy on the connection (REQ-INGEST-11); last good items untouched.
    await store.setConnectionError(conn.id, `${error.message} — ${error.remedy}`);
    return {
      connectionId: conn.id,
      discovered: 0,
      added: 0,
      removedRemote: 0,
      changed: 0,
      newVersions: 0,
      skippedUnchanged: 0,
      errors: [error],
    };
  }

  const existing = await store.listItems(conn.id);
  const byExternal = new Map(existing.filter((i) => i.externalId != null).map((i) => [i.externalId!, i]));
  const seen = new Set<string>();
  const toFetch: { item: ExistingItem; draft: DiscoveredDraft }[] = [];
  let added = 0;
  let removedRemote = 0;
  let changed = 0;
  let skipped = 0;

  for (const draft of discovered) {
    seen.add(draft.externalId);
    const prev = byExternal.get(draft.externalId);
    if (!prev) {
      const state = defaultState(draft, conn, auto);
      const item = await store.createItem(conn.id, draft, state);
      added += 1;
      if (state === "included") toFetch.push({ item, draft });
      continue;
    }
    // Refresh listing fields the provider reported (access may have changed too).
    await store.setItemMeta(prev.id, {
      title: draft.title,
      url: draft.url,
      date: draft.date,
      wordCount: draft.wordCount,
      access: draft.access,
    });
    if (prev.state === "new" || prev.state === "omitted" || prev.state === "unreadable") {
      // Not included → never fetch (REQ-INGEST-5): keep the listing fresh, update the key.
      const key = provider.changeKey(draft);
      if (key !== prev.remoteChangeKey) await store.setRemoteChangeKey(prev.id, key);
      continue;
    }
    const key = provider.changeKey(draft);
    if (key != null && key === prev.remoteChangeKey && prev.currentSampleId != null) {
      skipped += 1; // remote clock unchanged AND a version exists — no fetch, no pill change
      continue;
    }
    // An included item with no sample yet ALWAYS fetches — the user just confirmed it.
    changed += 1; // key bumped OR keyless → conditional re-fetch; the body hash decides
    toFetch.push({ item: prev, draft });
  }

  // Removed-remote: an included item the remote no longer lists → kept, badged, bytes retained.
  for (const item of existing) {
    if (item.externalId == null || seen.has(item.externalId)) continue;
    if (item.state === "included" || item.state === "removed_remote") {
      if (item.state !== "removed_remote") {
        await store.setItemState(item.id, "removed_remote");
        removedRemote += 1;
      }
    }
  }

  // Fetch phase — included items only, in discovery order, paced.
  let newVersions = 0;
  for (const { item, draft } of toFetch) {
    const fetched = await provider.fetch(draft, conn, pdeps);
    if (!fetched.ok) {
      errors.push(itemError(fetched.error, item.id));
      continue; // last good version stays (REQ-INGEST-9)
    }
    const originalSha256 = sha256Hex(fetched.body.bytes);
    let converted;
    try {
      converted = await deps.convert.convert(fetched.body.bytes, {
        assertedContentType: fetched.body.contentType,
      });
    } catch (e) {
      errors.push({
        itemId: item.id,
        message: `convert failed: ${String((e as Error)?.message ?? e).slice(0, 120)}`,
        remedy: "Re-run the sync; if it persists, upload the file directly",
      });
      continue;
    }
    const notes = [...converted.qualityNotes];
    if (fetched.body.meta.paywalled) notes.push("paywall detected — the item is partial");
    const quality = fetched.body.meta.paywalled ? "partial" : converted.quality;
    const doc = await canonicalSampleMarkdown(
      {
        id: deps.newId?.() ?? `sv_${item.id}_${Date.now()}`,
        title: fetched.body.meta.title ?? draft.title ?? item.title ?? "Untitled",
        date: fetched.body.meta.date ?? draft.date,
        url: fetched.body.meta.url ?? draft.url,
        provider: provider.id,
        connectionId: conn.id,
        externalId: draft.externalId,
        originalFormat: fetched.body.contentType.includes("html") ? "html" : "txt",
        originalSha256,
        fetchedAt: nowOf(deps),
        updatedAtRemote: fetched.body.meta.updatedAtRemote ?? undefined,
        quality,
        qualityNotes: notes,
        bodyMarkdown: converted.markdown,
      },
      deps.images,
    );

    // AC-I-A: a new version ONLY when the normalized body hash changed (timestamp-only churn → none).
    if (doc.contentSha256 === item.contentSha256) {
      const key = provider.changeKey(draft) ?? postFetchKey(provider.id, fetched.body.meta, doc.contentSha256);
      if (key !== item.remoteChangeKey) await store.setRemoteChangeKey(item.id, key);
      continue;
    }

    const n = await store.nextVersionN(item.id);
    await store.writeSample(item.id, n, {
      document: doc.document,
      contentSha256: doc.contentSha256,
      originalSha256,
      quality,
      qualityNotes: notes,
      wordCount: doc.wordCount,
      originalBytes: fetched.body.bytes,
    });
    // The post-fetch key: the provider's discovery key when it had one, else ETag/Last-Modified,
    // else the body hash itself — so the next sync skips the fetch entirely.
    await store.setRemoteChangeKey(item.id, provider.changeKey(draft) ?? postFetchKey(provider.id, fetched.body.meta, doc.contentSha256));
    if (item.state === "removed_remote") await store.setItemState(item.id, "included");
    newVersions += 1;
  }

  const first = errors[0];
  await store.setConnectionError(conn.id, first ? `${first.message} — ${first.remedy}` : null);
  await store.setConnectionSynced(conn.id, nowOf(deps));
  return {
    connectionId: conn.id,
    discovered: discovered.length,
    added,
    removedRemote,
    changed,
    newVersions,
    skippedUnchanged: skipped,
    errors,
  };
}

/** The change key learned at fetch time when discovery had none (§9.5: url → ETag/Last-Modified,
 *  everything else → normalized body hash). */
function postFetchKey(
  providerId: string,
  meta: { etag?: string | null; lastModified?: string | null },
  contentSha256: string,
): string {
  if (providerId === "url") {
    const k = urlChangeKey(meta);
    if (k) return k;
  }
  return `sha256:${contentSha256}`;
}
