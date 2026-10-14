// ONB.1 / SPA.14 — the held-draft IndexedDB seam (REQ-ISL-13; §15.1/§15.3). Extracted from
// `client/landing.ts` so BOTH consumers share the one store + the one copy: the landing island
// (drop-zone holds, the /app/new claim, the `data-held-consumed` handshake — all unchanged) and
// the `onboarding` SPA surface (the same claim + discard inside the React form). Browser-safe by
// construction: IDB + File APIs only, no DOM queries, no node builtins — the esbuild island and the
// Vite SPA bundle pull exactly the pieces they use.
//
// The durability contract (ONB.1, verbatim from the island's own comments):
//   • a hold lives at ONE key in ONE store — `rhema-hold` / `holds` / `landing-dropzone`;
//   • NO claim-on-attach: hydration never mutates the record, so every /app/new visit re-populates
//     the file input;
//   • a hold dies to exactly two writers — the token-matched `data-held-consumed` marker (the
//     server echoes `?hc=` after a create that consumed it) and the explicit Discard;
//   • legacy records carry `claimed: true` — ignored entirely.

/** The hold notice copy — the ONE source both renderers paint (`data-held-notice`). The literal
 *  strings are pinned byte-for-byte by client/landing.test.ts — the island's own contract. */
export function heldReadyText(name: string): string {
  // Hydration attached the bytes to the file input — Continue uploads them.
  return `"${name}" is ready — press Continue to upload it.`;
}
export function heldReattachText(name: string): string {
  // DataTransfer unavailable — the file is still held; the user re-picks it manually.
  return `"${name}" is held in this browser, but this browser can't attach it automatically — pick the same file again below to upload it.`;
}
/** The Discard control's label (the OTHER writer that deletes a hold). */
export const HELD_DISCARD_CTA = "Discard held file";
/** Post-discard notice. */
export const HELD_DISCARDED_TEXT = "Held file discarded.";

export const HOLD_DB = "rhema-hold";
export const HOLD_STORE = "holds";
export const HOLD_KEY = "landing-dropzone";
export const MAX_HOLD_BYTES = 10 * 1024 * 1024; // ≤10 MB per REQ-GROWTH-1
// The picker's `accept` attr doesn't bind a DROP — enforce the §15.1 file set on every path.
export const HOLD_EXT = new Set(["md", "markdown", "docx", "pdf", "txt"]);

export interface HoldRecord {
  readonly token: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly bytes: ArrayBuffer;
  /** P1.17 legacy — old records carry `claimed`; ONB.1 ignores it entirely (no claim-on-attach). */
  readonly claimed?: boolean;
}

export function holdToken(): string {
  return `hold_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

export function holdKindOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1]!.toLowerCase() : "text";
}

export function openHoldDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(HOLD_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(HOLD_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putHold(rec: HoldRecord): Promise<boolean> {
  const db = await openHoldDb();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(HOLD_STORE, "readwrite");
    tx.objectStore(HOLD_STORE).put(rec, HOLD_KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

export async function getHold(): Promise<HoldRecord | null> {
  const db = await openHoldDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(HOLD_STORE, "readonly");
    const req = tx.objectStore(HOLD_STORE).get(HOLD_KEY);
    req.onsuccess = () => resolve((req.result as HoldRecord | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
}

/** Delete the hold, bytes included — the ONLY writers are the token-matched consumed marker and Discard. */
export async function deleteHold(): Promise<void> {
  const db = await openHoldDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(HOLD_STORE, "readwrite");
    tx.objectStore(HOLD_STORE).delete(HOLD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
