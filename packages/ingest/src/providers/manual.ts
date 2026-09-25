// The upload + paste providers (§9.5 last matrix row; REQ-INGEST-1's "uploads/pastes are connections
// without discovery"). They implement the Provider interface for the registry's completeness —
// `hasDiscovery: false`, `discover()` emits nothing, and bodies arrive through the quarantine/paste
// path (the api's POST /voices/:id/samples), never through a remote fetch. `upload`'s fetch reads the
// quarantined file through the BlobPort when a caller drives it (the batch-upload path).

import { sha256Hex } from "@rhema/contracts";
import type {
  ConnectionRef,
  DiscoveredDraft,
  FetchOutcome,
  Provider,
  ProviderDeps,
} from "../types.js";

const NO_DISCOVERY = "uploads and pastes are connections without discovery";

export function createUploadProvider(): Provider {
  return {
    id: "upload",
    hasDiscovery: false,
    async discover(): Promise<DiscoveredDraft[]> {
      return [];
    },
    async fetch(item: DiscoveredDraft, conn: ConnectionRef, deps: ProviderDeps): Promise<FetchOutcome> {
      // item.externalId carries the quarantine key for batch uploads.
      const bytes = deps.blobs ? await deps.blobs.read(item.externalId) : null;
      if (!bytes) {
        return {
          ok: false,
          error: { message: `upload bytes for ${item.externalId} unavailable`, remedy: "Upload the file again" },
        };
      }
      return {
        ok: true,
        body: {
          bytes,
          contentType: "application/octet-stream",
          meta: { title: item.title },
        },
      };
    },
    // The upload provider's change key is the file hash (§9.5) — computed from the bytes at fetch.
    changeKey(draft: DiscoveredDraft): string | null {
      return draft.remoteChangeKey ?? null;
    },
  };
}

export function createPasteProvider(): Provider {
  return {
    id: "paste",
    hasDiscovery: false,
    async discover(): Promise<DiscoveredDraft[]> {
      return [];
    },
    async fetch(): Promise<FetchOutcome> {
      // Pasted text is already the body — there is nothing to fetch.
      return { ok: false, error: { message: NO_DISCOVERY, remedy: "Paste the text again" } };
    },
    changeKey(draft: DiscoveredDraft): string | null {
      return draft.remoteChangeKey ?? `sha256:${draft.externalId}`;
    },
  };
}

/** The upload provider's file-hash change key (§9.5 "file/content hash"). */
export function uploadChangeKey(bytes: Uint8Array): string {
  return `sha256:${sha256Hex(bytes)}`;
}
