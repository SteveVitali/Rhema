// P1.17 (§15.1/§15.3; REQ-GROWTH-1) — the landing island, three jobs, all progressive enhancement:
//
//   1. THE DROP-ZONE HOLD (landing page): a dropped/picked .md/.docx/.pdf (or pasted text) is held
//      CLIENT-SIDE — IndexedDB, ≤10 MB, the api never sees it pre-auth. A `landing.dropzone_used`
//      beacon posts the hold's token + kind (never bytes, never the filename), and the browser
//      routes to /signup?intent=review&held=1.
//   2. THE HOLD CLAIM (/app/new): after auth, the same island reads the hold back and hydrates the
//      new-project sheet's file input via DataTransfer — on EVERY load, not just the first: ONB.1
//      made the hold durable (REQ-GROWTH-1 amended). There is no claim-on-attach: the record is
//      untouched by hydration, so a second and a tenth /app/new visit re-populate the input.
//   3. THE CONSUMED HANDSHAKE (project pages): the claim stamps the hold's token into a hidden
//      `heldToken` field; after a create succeeds the server echoes it back as `?hc=` and the
//      landing page renders `data-held-consumed="<token>"`. This island deletes the hold ONLY when
//      the echoed token matches its record — the hold dies to a server-confirmed consumption or an
//      explicit Discard, never to a page view.
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
  /** P1.17 legacy — old records carry `claimed`; ONB.1 ignores it entirely (no claim-on-attach). */
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

/** Delete the hold, bytes included — the ONLY writers are the token-matched consumed marker and Discard. */
async function deleteHold(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(HOLD_STORE, "readwrite");
    tx.objectStore(HOLD_STORE).delete(HOLD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
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

// ---- job 2: the hold claim (/app/new — every load while a hold exists) ------------------

const heldForm = document.querySelector<HTMLFormElement>('form[action="/app/new"][data-held]');
if (heldForm) {
  void (async () => {
    const rec = await getHold();
    if (!rec) return;
    const fileInput = heldForm.querySelector<HTMLInputElement>('input[name="file"]');
    const titleInput = heldForm.querySelector<HTMLInputElement>('input[name="title"]');
    const tokenInput = heldForm.querySelector<HTMLInputElement>('input[name="heldToken"]');
    const notice = document.querySelector<HTMLElement>("[data-held-notice]");
    let attached = false;
    if (fileInput) {
      try {
        const dt = new DataTransfer();
        dt.items.add(new File([rec.bytes], rec.name, { type: rec.type || "application/octet-stream" }));
        fileInput.files = dt.files;
        attached = fileInput.files.length === 1;
      } catch {
        attached = false; // DataTransfer unavailable — the notice says exactly what to do instead.
      }
    }
    // The token rides the create ONLY when the held bytes were actually attached — a hold is
    // consumed by a project created FROM it, never by an unrelated upload that shares the form.
    if (attached && tokenInput) tokenInput.value = rec.token;
    if (titleInput && !titleInput.value) {
      // the filename stem is the island's default; the document's own H1 still wins server-side
      // (the POST resolves typed → H1 → stem — ONB.1's fidelity fix).
      titleInput.value = rec.name.replace(/\.[^.]+$/, "").slice(0, 120);
    }
    if (notice) {
      notice.textContent = attached
        ? `"${rec.name}" is ready — press Continue to upload it.`
        : `"${rec.name}" is held in this browser, but this browser can't attach it automatically — pick the same file again below to upload it.`;
      // Discard — the OTHER path that deletes a hold (REQ-GROWTH-1's explicit-abandon affordance).
      const discard = document.createElement("button");
      discard.type = "button";
      discard.textContent = "Discard held file";
      discard.dataset.heldDiscard = "1";
      discard.style.marginLeft = "10px";
      discard.style.fontSize = "12px";
      discard.addEventListener("click", () => {
        void deleteHold().then(() => {
          try {
            if (fileInput) fileInput.value = "";
          } catch {
            /* a cleared input is best-effort — the hold is gone either way */
          }
          if (tokenInput) tokenInput.value = "";
          notice.textContent = "Held file discarded.";
          discard.remove();
        });
      });
      notice.appendChild(discard);
    }
  })();
}

// ---- job 3: the consumed handshake (any page carrying `data-held-consumed`) -------------

const consumed = document.querySelector<HTMLElement>("[data-held-consumed]");
if (consumed) {
  void (async () => {
    const marker = consumed.getAttribute("data-held-consumed") ?? "";
    const rec = await getHold();
    // ONLY a server-echoed token matching THIS hold's token deletes it — a foreign or empty
    // marker leaves the hold (and its bytes) in place.
    if (rec && marker && marker === rec.token) await deleteHold();
  })();
}
