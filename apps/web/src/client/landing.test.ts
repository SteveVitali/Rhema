// @vitest-environment happy-dom
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, vi, beforeEach } from "vitest";

// P1.17 + ONB.1 (§15.1/§15.3; REQ-GROWTH-1 amended) — the landing island's three jobs under a real
// DOM + a real IndexedDB (happy-dom + fake-indexeddb): the drop-zone HOLD (bytes stay on the device;
// the beacon carries a token + kind, never a filename or contents), the /app/new CLAIM (the held
// file hydrates the file input on EVERY load — no claim-on-attach), and the CONSUMED HANDSHAKE (the
// hold is deleted only by a server-echoed token-matched `data-held-consumed` marker or Discard).

const LANDING = `
<form data-dropzone action="/signup" method="get">
  <input type="hidden" name="intent" value="review" />
  <label data-dropzone-label for="hero-file"><strong>Drop</strong><div data-dropzone-hint></div></label>
  <input id="hero-file" name="held" type="file" accept=".md,.markdown,.docx,.pdf,.txt" />
  <details><summary>paste</summary><textarea name="paste"></textarea></details>
</form>`;

const NEW_FORM = `
<form method="post" action="/app/new" data-held="1">
  <input type="file" name="file" />
  <input type="hidden" name="heldToken" data-held-token value="" />
  <input name="title" value="" />
</form>
<p data-held-notice></p>`;

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

const loadIsland = async () => {
  vi.resetModules();
  await import("./landing.js");
};

const pickFile = (input: HTMLInputElement, file: File) => {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new window.Event("change"));
};

const readHold = async (): Promise<Record<string, unknown> | null> => {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open("rhema-hold", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("holds");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return new Promise((res) => {
    const req = db.transaction("holds", "readonly").objectStore("holds").get("landing-dropzone");
    req.onsuccess = () => res((req.result as Record<string, unknown>) ?? null);
    req.onerror = () => res(null);
  });
};

const seedHold = async (rec: Record<string, unknown>) => {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open("rhema-hold", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("holds");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("holds", "readwrite");
    tx.objectStore("holds").put(rec, "landing-dropzone");
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
};

const holdRec = (over: Record<string, unknown> = {}) => ({
  token: "hold_abc",
  name: "chapter-one.docx",
  type: "application/vnd.openxmlformats",
  size: 5,
  bytes: new TextEncoder().encode("hello").buffer,
  ...over,
});

const beaconBodies = async (): Promise<Record<string, unknown>[]> => {
  const spy = vi.mocked(navigator.sendBeacon);
  return Promise.all(
    spy.mock.calls.map(async ([, blob]) => JSON.parse(await (blob as Blob).text()) as Record<string, unknown>),
  );
};

beforeEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "http://localhost:3000/");
  // a fresh factory per test — the island holds its connection open, so deleting the named
  // database would deadlock against it; a new factory isolates tests regardless.
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.spyOn(navigator, "sendBeacon").mockImplementation(() => true);
  vi.spyOn(window, "fetch").mockImplementation(async () => new Response("{}"));
});

describe("job 1 — the drop-zone hold (REQ-GROWTH-1)", () => {
  it("a picked file is held client-side → beacon carries token+kind (never bytes/name) → /signup?intent=review&held=1", async () => {
    document.body.innerHTML = LANDING;
    await loadIsland();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    pickFile(input, new File(["# Draft body"], "chapter-one.docx", { type: "application/vnd.openxmlformats" }));
    await flush();

    const rec = await readHold();
    expect(rec?.name).toBe("chapter-one.docx");
    expect((rec?.bytes as ArrayBuffer).byteLength).toBe(12);
    expect((rec?.token as string)).toMatch(/^hold_/);

    const bodies = await beaconBodies();
    expect(bodies.length).toBe(1);
    expect(bodies[0]).toMatchObject({ event: "landing.dropzone_used", props: { kind: "docx" } });
    // no PII — the filename and the file bytes never leave the device
    expect(JSON.stringify(bodies[0])).not.toContain("chapter-one");
    expect(JSON.stringify(bodies[0])).not.toContain("Draft body");

    expect(window.location.href).toBe("http://localhost:3000/signup?intent=review&held=1");
  });

  it("a dropped file takes the same hold path (the drop forwards past the picker's accept attr)", async () => {
    document.body.innerHTML = LANDING;
    await loadIsland();
    const label = document.querySelector<HTMLElement>("[data-dropzone-label]")!;
    const ev = new window.Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "dataTransfer", {
      value: { files: [new File(["body"], "notes.md", { type: "text/markdown" })] },
    });
    label.dispatchEvent(ev);
    await flush();
    const rec = await readHold();
    expect(rec?.name).toBe("notes.md");
    expect((await beaconBodies())[0]).toMatchObject({ event: "landing.dropzone_used", props: { kind: "md" } });
    expect(window.location.href).toBe("http://localhost:3000/signup?intent=review&held=1");
  });

  it("an oversized file refuses with a hint — no beacon, no navigation", async () => {
    document.body.innerHTML = LANDING;
    await loadIsland();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "huge.pdf", { type: "application/pdf" });
    pickFile(input, big);
    await flush();
    expect(document.querySelector("[data-dropzone-hint]")!.textContent).toContain("10 MB");
    expect(await readHold()).toBeNull();
    expect(window.location.href).toBe("http://localhost:3000/");
    expect(vi.mocked(navigator.sendBeacon)).not.toHaveBeenCalled();
  });

  it("an unsupported extension refuses with a hint — the drop path enforces what accept cannot", async () => {
    document.body.innerHTML = LANDING;
    await loadIsland();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    pickFile(input, new File(["MZ"], "payload.exe", { type: "application/octet-stream" }));
    await flush();
    expect(document.querySelector("[data-dropzone-hint]")!.textContent).toContain("isn't supported");
    expect(await readHold()).toBeNull();
    expect(window.location.href).toBe("http://localhost:3000/");
  });

  it("pasted text becomes a .md hold via the injected Hold-my-text button", async () => {
    document.body.innerHTML = LANDING;
    await loadIsland();
    const paste = document.querySelector<HTMLTextAreaElement>('textarea[name="paste"]')!;
    paste.value = "A paragraph of pasted draft.";
    // the island appended the button to the textarea's parent (the <details>)
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Hold my text")!;
    btn.click();
    await flush();
    const rec = await readHold();
    expect(rec?.name).toBe("pasted-draft.md");
    const bodies = await beaconBodies();
    expect(bodies[0]).toMatchObject({ event: "landing.dropzone_used", props: { kind: "md" } });
    expect(JSON.stringify(bodies[0])).not.toContain("pasted draft");
    expect(window.location.href).toBe("http://localhost:3000/signup?intent=review&held=1");
  });

  it("no IndexedDB ⇒ the hold degrades to a hint but still beacons + routes (progressive enhancement)", async () => {
    vi.stubGlobal("indexedDB", undefined);
    document.body.innerHTML = LANDING;
    await loadIsland();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    pickFile(input, new File(["x"], "draft.md", { type: "text/markdown" }));
    await flush();
    expect(document.querySelector("[data-dropzone-hint]")!.textContent).toContain("storage access");
    expect((await beaconBodies()).length).toBe(1);
    expect(window.location.href).toBe("http://localhost:3000/signup?intent=review&held=1");
    vi.unstubAllGlobals();
  });
});

describe("job 2 — the hold claim on /app/new (ONB.1: durable until consumed)", () => {
  it("hydrates the held file into the file input, seeds title + heldToken, and leaves the record UNTOUCHED (no claim-on-attach)", async () => {
    await seedHold(holdRec());
    document.body.innerHTML = NEW_FORM;
    await loadIsland();
    await flush();

    const fileInput = document.querySelector<HTMLInputElement>('input[name="file"]')!;
    expect(fileInput.files?.[0]?.name).toBe("chapter-one.docx");
    expect(document.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe("chapter-one");
    expect(document.querySelector<HTMLInputElement>('input[name="heldToken"]')!.value).toBe("hold_abc");
    expect(document.querySelector("[data-held-notice]")!.textContent).toContain("chapter-one.docx");
    // ONB.1's regression guard: hydration must NOT mark the hold — a second visit needs it intact.
    const rec = await readHold();
    expect(rec).not.toBeNull();
    expect(rec?.claimed).toBeUndefined();
  });

  it("a hold survives sign-in and TWO further /app/new loads — the file input is populated each time", async () => {
    await seedHold(holdRec());
    for (let visit = 1; visit <= 3; visit++) {
      document.body.innerHTML = NEW_FORM;
      await loadIsland();
      await flush();
      const fileInput = document.querySelector<HTMLInputElement>('input[name="file"]')!;
      expect(fileInput.files?.[0]?.name, `visit ${visit} re-populates the input`).toBe("chapter-one.docx");
      expect(await readHold(), `visit ${visit} keeps the hold`).not.toBeNull();
    }
  });

  it("a legacy `claimed: true` record still hydrates (pre-ONB.1 holds upgrade transparently)", async () => {
    await seedHold(holdRec({ claimed: true }));
    document.body.innerHTML = NEW_FORM;
    await loadIsland();
    await flush();
    expect(document.querySelector<HTMLInputElement>('input[name="file"]')!.files?.[0]?.name).toBe("chapter-one.docx");
  });

  it("Discard deletes the hold, clears the input + token, and updates the notice", async () => {
    await seedHold(holdRec());
    document.body.innerHTML = NEW_FORM;
    await loadIsland();
    await flush();
    const discard = document.querySelector<HTMLButtonElement>("[data-held-discard]")!;
    expect(discard.textContent).toBe("Discard held file");
    discard.click();
    await flush();
    expect(await readHold()).toBeNull();
    expect(document.querySelector<HTMLInputElement>('input[name="heldToken"]')!.value).toBe("");
    expect(document.querySelector("[data-held-notice]")!.textContent).toContain("discarded");
  });

  it("DataTransfer unavailable ⇒ the notice says exactly what to do (never an empty input under 'your file is here')", async () => {
    const RealDT = globalThis.DataTransfer;
    // @ts-expect-error — simulate a browser without the DataTransfer constructor
    vi.stubGlobal("DataTransfer", undefined);
    await seedHold(holdRec());
    document.body.innerHTML = NEW_FORM;
    await loadIsland();
    await flush();
    const notice = document.querySelector("[data-held-notice]")!.textContent!;
    expect(notice).toContain("chapter-one.docx");
    expect(notice).toContain("pick the same file again");
    // and the token is NOT stamped — the held bytes were never attached, so a create must not consume it
    expect(document.querySelector<HTMLInputElement>('input[name="heldToken"]')!.value).toBe("");
    vi.stubGlobal("DataTransfer", RealDT);
  });

  it("no hold ⇒ the claim path no-ops", async () => {
    document.body.innerHTML = NEW_FORM;
    await loadIsland();
    await flush();
    expect(document.querySelector<HTMLInputElement>('input[name="file"]')!.files?.length ?? 0).toBe(0);
    expect(document.querySelector<HTMLInputElement>('input[name="heldToken"]')!.value).toBe("");
  });
});

describe("job 3 — the consumed handshake (data-held-consumed)", () => {
  it("a marker matching the hold's token deletes it, bytes included", async () => {
    await seedHold(holdRec());
    document.body.innerHTML = `<span data-held-consumed="hold_abc" hidden></span>`;
    await loadIsland();
    await flush();
    expect(await readHold()).toBeNull();
  });

  it("a mismatched marker leaves the hold in place", async () => {
    await seedHold(holdRec());
    document.body.innerHTML = `<span data-held-consumed="hold_DIFFERENT" hidden></span>`;
    await loadIsland();
    await flush();
    expect(await readHold()).not.toBeNull();
  });

  it("an empty marker leaves the hold in place", async () => {
    await seedHold(holdRec());
    document.body.innerHTML = `<span data-held-consumed hidden></span>`;
    await loadIsland();
    await flush();
    expect(await readHold()).not.toBeNull();
  });

  it("no marker ⇒ the hold is untouched (only a server-confirmed create consumes)", async () => {
    await seedHold(holdRec());
    document.body.innerHTML = `<main><p>a plain project page</p></main>`;
    await loadIsland();
    await flush();
    expect(await readHold()).not.toBeNull();
  });
});
