// @vitest-environment happy-dom
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, vi, beforeEach } from "vitest";

// P1.17 (§15.1/§15.3; REQ-GROWTH-1) — the landing island's two jobs under a real DOM + a real
// IndexedDB (happy-dom + fake-indexeddb): the drop-zone HOLD (bytes stay on the device; the beacon
// carries a token + kind, never a filename or contents) and the /app/new CLAIM (the held file
// hydrates the file input via DataTransfer, seeds the title, marks itself claimed).

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

describe("job 2 — the hold claim on /app/new?held=1", () => {
  it("hydrates the held file into the file input via DataTransfer, seeds the title, marks claimed", async () => {
    await seedHold({
      token: "hold_abc",
      name: "chapter-one.docx",
      type: "application/vnd.openxmlformats",
      size: 5,
      bytes: new TextEncoder().encode("hello").buffer,
    });
    document.body.innerHTML = NEW_FORM;
    await loadIsland();
    await flush();

    const fileInput = document.querySelector<HTMLInputElement>('input[name="file"]')!;
    expect(fileInput.files?.[0]?.name).toBe("chapter-one.docx");
    expect(document.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe("chapter-one");
    expect(document.querySelector("[data-held-notice]")!.textContent).toContain("chapter-one.docx");
    expect((await readHold())?.claimed).toBe(true);
  });

  it("a claimed hold is a ghost — a second visit leaves the form untouched", async () => {
    await seedHold({
      token: "hold_abc",
      name: "chapter-one.docx",
      type: "text/markdown",
      size: 1,
      bytes: new TextEncoder().encode("x").buffer,
      claimed: true,
    });
    document.body.innerHTML = NEW_FORM;
    await loadIsland();
    await flush();
    const fileInput = document.querySelector<HTMLInputElement>('input[name="file"]')!;
    expect(fileInput.files?.length ?? 0).toBe(0);
    expect(document.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe("");
    expect(document.querySelector("[data-held-notice]")!.textContent).toBe("");
  });

  it("no hold ⇒ the claim path no-ops", async () => {
    document.body.innerHTML = NEW_FORM;
    await loadIsland();
    await flush();
    expect(document.querySelector<HTMLInputElement>('input[name="file"]')!.files?.length ?? 0).toBe(0);
  });
});
