// The provider framework types (§9.5; REQ-INGEST-1/2). Everything in @rhema/ingest is pure TS:
// the network sits behind the injected `FetchPort` (bound upstream to the operator-owned fetcher
// service — SSRF-guarded, ≤1 req/s/host, robots-respecting, honest UA), conversion behind a
// `ConvertPort` (bound to @rhema/convert's byte pipeline), and persistence behind `SyncStore`.
// NEVER-COOKIES is structural here: no provider type accepts a credential of any kind — there is
// no field, header, or parameter for a session token anywhere in this package (AC-I-B).

import type { QualityVerdict } from "@rhema/contracts";

/** The five MVP providers (§9.5 matrix). Ghost/WordPress/RSS/Medium/Notion/Drive are 1.x — the
 *  interface is built for them but only these ship. */
export type ProviderId = "substack" | "substack_export" | "url" | "upload" | "paste";

/** One guarded GET through the fetcher boundary. The port returns raw bytes + metadata and parses
 *  NOTHING (the F41 split). Failures are values, not throws. */
export type FetchResult =
  | {
      readonly ok: true;
      readonly status: number;
      readonly finalUrl: string;
      readonly contentType: string;
      /** Response headers (lowercased names) — ETag/Last-Modified feed the url provider's change key. */
      readonly headers: Readonly<Record<string, string>>;
      readonly bytes: Uint8Array;
    }
  | {
      readonly ok: false;
      readonly status?: number;
      /** The fetcher boundary's machine reason (scheme|ssrf|redirect|content_type|too_large|timeout|
       *  status|error|rate_limited|robots) — carried verbatim into the connection's error line. */
      readonly denyReason?: string;
      readonly reason: string;
      readonly finalUrl?: string;
    };

export interface FetchPort {
  get(url: string, opts?: { readonly accept?: readonly string[] }): Promise<FetchResult>;
}

/** The conversion boundary (bound to @rhema/convert's convertBytes by the worker; faked in tests). */
export interface ConvertPort {
  convert(
    bytes: Uint8Array,
    opts?: { readonly assertedContentType?: string },
  ): Promise<{
    readonly markdown: string;
    readonly quality: QualityVerdict;
    readonly qualityNotes: readonly string[];
    readonly counts: { readonly words: number };
  }>;
}

/** A file-backed provider's byte source (export zip in quarantine; upload batches). */
export interface BlobPort {
  /** Read the bytes a connection references (e.g. `handle` carries `quarantine/<ws>/<id>`). */
  read(handle: string): Promise<Uint8Array | null>;
}

/** A connection's persisted fact set — the subset of the `connections` row the providers read. */
export interface ConnectionRef {
  readonly id: string;
  readonly provider: ProviderId;
  /** The provider handle: a publication host/URL for `substack`, the linked page for `url`, the
   *  quarantine key (`quarantine/<ws>/<id>`) for `substack_export`, a file name for `upload`. */
  readonly handle: string | null;
  /** Per-connection knobs (§9.5 Settings): daily auto-sync opt-in + never-auto-include default. */
  readonly autoIncludeNew?: boolean;
  readonly schedule?: string | null;
}

/** Item-level access as discovery reports it — drives the default include/omit + the export CTA. */
export type DiscoveredAccess = "free" | "paywalled" | "unknown";

/** A discovery row — title/date/words/access/change key, NEVER a body (REQ-INGEST-3). */
export interface DiscoveredDraft {
  readonly externalId: string;
  readonly title: string | null;
  readonly url: string | null;
  /** ISO date (YYYY-MM-DD) when the provider reports one. */
  readonly date: string | null;
  readonly wordCount: number | null;
  readonly access: DiscoveredAccess;
  /** The provider's remote change key (`updated_at` / ETag / Last-Modified / file hash); null when
   *  the provider cannot know the body changed without fetching it — sync then re-fetches and the
   *  normalized body hash decides (AC-I-A). */
  readonly remoteChangeKey: string | null;
}

/** A fetched body — raw bytes plus the metadata the canonical front-matter carries. */
export interface FetchedBody {
  readonly bytes: Uint8Array;
  /** The convert-seam content type (text/html for post bodies/pages; the upload provider carries
   *  the quarantined file's sniffed type through the caller instead). */
  readonly contentType: string;
  readonly meta: {
    readonly title?: string | null;
    readonly date?: string | null;
    readonly url?: string | null;
    /** Response ETag/Last-Modified captured at fetch — becomes `remote_change_key` for the url
     *  provider (it has no remote clock). */
    readonly etag?: string | null;
    readonly lastModified?: string | null;
    /** The provider's own update timestamp (Substack `updated_at`) — front-matter `updated_at_remote`. */
    readonly updatedAtRemote?: string | null;
    /** Set when the fetch recognized a paywall — the item lands `partial` with a note (§9.5 url row). */
    readonly paywalled?: boolean;
  };
}

export type FetchOutcome =
  | { readonly ok: true; readonly body: FetchedBody }
  | { readonly ok: false; readonly error: ProviderError };

/** A provider failure: the provider's verbatim message plus a remedy line (REQ-INGEST-11). */
export interface ProviderError {
  readonly message: string;
  readonly remedy: string;
}

export interface ProviderDeps {
  readonly fetch: FetchPort;
  /** File-backed providers (export zip / upload) read their bytes here. */
  readonly blobs?: BlobPort;
  readonly now?: () => Date;
}

/** The one interface every provider implements (REQ-INGEST-2). */
export interface Provider {
  readonly id: ProviderId;
  /** False for upload/paste — connections without discovery (REQ-INGEST-1). */
  readonly hasDiscovery: boolean;
  /** Emit discovery rows only — a correct implementation makes ZERO body-endpoint calls (the sync
   *  engine + tests instrument the fetch port to assert it). */
  discover(conn: ConnectionRef, deps: ProviderDeps): Promise<DiscoveredDraft[]>;
  /** Fetch one item's body. Paywalled items are NEVER fetched (the engine skips them; a provider
   *  that receives one anyway refuses — belt and suspenders for REQ-INGEST-5). */
  fetch(item: DiscoveredDraft, conn: ConnectionRef, deps: ProviderDeps): Promise<FetchOutcome>;
  /** The remote change key for a discovery row (`updated_at` → body-hash order per provider). */
  changeKey(draft: DiscoveredDraft): string | null;
}
