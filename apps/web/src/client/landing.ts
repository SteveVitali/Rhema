// P1.17 (§15.1/§15.3; REQ-GROWTH-1) — the landing island. Two jobs, both progressive enhancement:
//
//   1. THE DROP-ZONE HOLD (landing page): a dropped/picked .md/.docx/.pdf (or pasted text) is held
//      CLIENT-SIDE — IndexedDB, ≤10 MB, the api never sees it pre-auth. A `landing.dropzone_used`
//      beacon posts the hold's token + kind (never bytes, never the filename), and the browser
//      routes to /signup?intent=review&held=1.
//   2. THE HOLD CLAIM (/app/new?held=1): after auth, the same island reads the hold back, hydrates
//      the new-project sheet's file input via DataTransfer, seeds the title, and leaves the hold
//      marked `claimed` (a second visit sees the notice, not a ghost file). The submit then rides
//      the SAME upload path every other file takes — presign → quarantine → convert → preview.
//
// No credentials, no analytics payloads beyond the beacon shape, no server round-trips except the
// two same-origin beacons. Without this bundle the SSR forms/links still work end-to-end.

const HOLD_DB = "rhema-hold";
const HOLD_STORE = "holds";
const HOLD_KEY = "landing-dropzone";
const MAX_HOLD_BYTES = 10 * 1024 * 1024; // ≤10 MB per REQ-GROWTH-1
// The picker's `accept` attr doesn't bind a DROP — enforce the §15.1 file set on every path.
const HOLD_EXT = new Set(["md", "markdown", "docx", "pdf", "txt"]);

interface HoldRecord {
  readonly token: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly bytes: ArrayBuffer;
  readonly claimed?: boolean;
}

function token(): string {
  return `hold_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

function beacon(body: Record<string, unknown>): void {
  const payload = JSON.stringify(body);
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/a/landing", new Blob([payload], { type: "application/json" }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  void fetch("/a/landing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}

function openDb(): Promise<IDBDatabase | null> {
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

async function putHold(rec: HoldRecord): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(HOLD_STORE, "readwrite");
    tx.objectStore(HOLD_STORE).put(rec, HOLD_KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

async function getHold(): Promise<HoldRecord | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(HOLD_STORE, "readonly");
    const req = tx.objectStore(HOLD_STORE).get(HOLD_KEY);
    req.onsuccess = () => resolve((req.result as HoldRecord | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function markClaimed(): Promise<void> {
  const rec = await getHold();
  if (!rec) return;
  await putHold({ ...rec, claimed: true });
}

function kindOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1]!.toLowerCase() : "text";
}

// ---- job 1: the drop-zone hold (landing) ---------------------------------------------

const dropzone = document.querySelector<HTMLElement>("[data-dropzone]");
if (dropzone) {
  const fileInput = dropzone.querySelector<HTMLInputElement>('input[type="file"]');
  const label = dropzone.querySelector<HTMLElement>("[data-dropzone-label]");
  const hint = dropzone.querySelector<HTMLElement>("[data-dropzone-hint]");
  const paste = dropzone.querySelector<HTMLTextAreaElement>('textarea[name="paste"]');

  const holdFile = async (name: string, type: string, bytes: ArrayBuffer): Promise<void> => {
    if (!HOLD_EXT.has(kindOf(name))) {
      if (hint) hint.textContent = "That file type isn't supported yet — drop a .md, .docx, .pdf or .txt.";
      return;
    }
    if (bytes.byteLength > MAX_HOLD_BYTES) {
      if (hint) hint.textContent = "That file is over 10 MB — sign in and upload it directly.";
      return;
    }
    const rec: HoldRecord = { token: token(), name, type, size: bytes.byteLength, bytes };
    const ok = await putHold(rec);
    if (!ok && hint) hint.textContent = "The hold needs storage access — sign in and upload it directly.";
    beacon({
      event: "landing.dropzone_used",
      props: { kind: kindOf(name), size: rec.size },
      token: rec.token,
    });
    window.location.assign("/signup?intent=review&held=1");
  };

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      void f.arrayBuffer().then((buf) => holdFile(f.name, f.type, buf));
    });
  }

  // paste: a textarea + a "hold" affordance — the text becomes a .md hold.
  const pasteBtn = document.createElement("button");
  pasteBtn.type = "button";
  pasteBtn.textContent = "Hold my text";
  pasteBtn.style.marginTop = "8px";
  pasteBtn.addEventListener("click", () => {
    const text = paste?.value ?? "";
    if (!text.trim()) return;
    const bytes = new TextEncoder().encode(text).buffer as ArrayBuffer;
    void holdFile("pasted-draft.md", "text/markdown", bytes);
  });
  if (paste?.parentElement) paste.parentElement.appendChild(pasteBtn);

  // drag-over affordance on the label (no drop listeners needed — the file input covers click;
  // a drop onto the label forwards to the input).
  if (label) {
    label.addEventListener("dragover", (e) => e.preventDefault());
    label.addEventListener("drop", (e) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      void f.arrayBuffer().then((buf) => holdFile(f.name, f.type, buf));
    });
  }
}

// ---- job 2: the hold claim (/app/new?held=1) ------------------------------------------

const heldForm = document.querySelector<HTMLFormElement>('form[action="/app/new"][data-held]');
if (heldForm) {
  void (async () => {
    const rec = await getHold();
    if (!rec || rec.claimed) return;
    const fileInput = heldForm.querySelector<HTMLInputElement>('input[name="file"]');
    const titleInput = heldForm.querySelector<HTMLInputElement>('input[name="title"]');
    if (fileInput) {
      try {
        const dt = new DataTransfer();
        dt.items.add(new File([rec.bytes], rec.name, { type: rec.type || "application/octet-stream" }));
        fileInput.files = dt.files;
      } catch {
        /* DataTransfer unavailable — the notice still tells the user the file is held */
      }
    }
    if (titleInput && !titleInput.value) {
      titleInput.value = rec.name.replace(/\.[^.]+$/, "").slice(0, 120);
    }
    const notice = document.querySelector<HTMLElement>("[data-held-notice]");
    if (notice) notice.textContent = `"${rec.name}" is ready — press Continue to upload it.`;
    await markClaimed();
  })();
}
