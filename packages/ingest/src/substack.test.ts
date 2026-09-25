import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  createSubstackProvider,
  createSubstackExportProvider,
  createUrlProvider,
  substackOrigin,
  syncConnection,
  rewriteFootnotes,
  draftsFromFeed,
} from "./index.js";
import type { ConnectionRef } from "./index.js";
import { enc, FakeBlobs, FakeConvert, FakeFetch, InMemoryStore } from "./test-helpers.js";

const NOW = new Date("2026-01-15T12:00:00Z");
const deps = (fetch: FakeFetch, store: InMemoryStore, blobs?: FakeBlobs) => ({
  fetch,
  blobs,
  convert: new FakeConvert(),
  store,
  now: () => NOW,
  newId: () => "sv_test_1",
  minFetchIntervalMs: 0,
});

const substackConn = (over?: Partial<ConnectionRef>): ConnectionRef => ({
  id: "conn_1",
  provider: "substack",
  handle: "example.substack.com",
  ...over,
});

const post = (over: Record<string, unknown>) => {
  const slug = (over.slug as string) ?? "hello-world";
  return {
    id: 1,
    slug,
    title: "Hello world",
    post_date: "2025-12-01T10:00:00.000Z",
    canonical_url: `https://example.substack.com/p/${slug}`,
    audience: "everyone",
    updated_at: "2025-12-02T00:00:00.000Z",
    ...over,
  };
};

const postBody = (html: string, over?: Record<string, unknown>) => ({
  title: "Hello world",
  post_date: "2025-12-01T10:00:00.000Z",
  canonical_url: "https://example.substack.com/p/hello-world",
  body_html: html,
  ...over,
});

describe("substack provider", () => {
  it("normalizes the publication handle to an https origin", () => {
    expect(substackOrigin("example.substack.com")).toBe("https://example.substack.com");
    expect(substackOrigin("https://example.substack.com/")).toBe("https://example.substack.com");
    expect(substackOrigin("ftp://x")).toBe(null);
  });

  it("discovers across archive pages and NEVER fetches a body", async () => {
    const fetch = new FakeFetch();
    const page0 = [post({ id: 1, slug: "a" }), post({ id: 2, slug: "b", audience: "only_paid" })];
    fetch
      .on("https://example.substack.com/api/v1/archive?sort=new&search=&offset=0", () => ({
        ok: true,
        status: 200,
        finalUrl: "",
        contentType: "application/json",
        headers: {},
        bytes: enc(JSON.stringify(page0)),
      }))
      .on("https://example.substack.com/api/v1/archive?sort=new&search=&offset=12", () => ({
        ok: true,
        status: 200,
        finalUrl: "",
        contentType: "application/json",
        headers: {},
        bytes: enc("[]"),
      }));
    const provider = createSubstackProvider();
    const drafts = await provider.discover(substackConn(), { fetch });
    expect(drafts).toHaveLength(2);
    expect(drafts[0]!.externalId).toBe("1");
    expect(drafts[0]!.remoteChangeKey).toBe("updated_at:2025-12-02T00:00:00.000Z");
    expect(drafts[1]!.access).toBe("paywalled");
    // REQ-INGEST-3: discovery never touches a body endpoint — only archive calls were made.
    expect(fetch.urlsMatching(/api\/v1\/posts\//)).toHaveLength(0);
  });

  it("falls back to /feed when the archive endpoint 404s", async () => {
    const fetch = new FakeFetch().on("https://example.substack.com/feed", () => ({
      ok: true,
      status: 200,
      finalUrl: "",
      contentType: "application/rss+xml",
      headers: {},
      bytes: enc(
        `<?xml version="1.0"?><rss version="2.0"><channel>` +
          `<item><title>Post A</title><link>https://example.substack.com/p/post-a</link>` +
          `<guid>https://example.substack.com/p/post-a</guid><pubDate>Mon, 01 Dec 2025 10:00:00 GMT</pubDate></item>` +
          `</channel></rss>`,
      ),
    }));
    const provider = createSubstackProvider();
    const drafts = await provider.discover(substackConn(), { fetch });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.title).toBe("Post A");
    expect(drafts[0]!.access).toBe("unknown"); // feed rows have no audience → omitted by default
    expect(drafts[0]!.remoteChangeKey).toBe(null); // no updated_at in RSS → body-hash decides
    expect(draftsFromFeed("<rss><channel></channel></rss>")).toHaveLength(0);
  });

  it("refuses to fetch a paywalled item even if asked (never-cookies ⇒ no paid fetch)", async () => {
    const provider = createSubstackProvider();
    const out = await provider.fetch(
      { externalId: "1", title: "x", url: null, date: null, wordCount: null, access: "paywalled", remoteChangeKey: null },
      substackConn(),
      { fetch: new FakeFetch() },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.remedy).toMatch(/export/i);
  });
});

describe("substack export-zip provider", () => {
  async function makeZip(): Promise<Uint8Array> {
    const zip = new JSZip();
    zip.file(
      "posts.csv",
      "post_id,title,post_date,canonical_url,audience\n" +
        '101,"Free post",2025-11-01,https://example.substack.com/p/free,everyone\n' +
        '102,"Paid post",2025-11-02,https://example.substack.com/p/paid,only_paid\n',
    );
    zip.file("posts/101.free-post.html", "<p>Free body text</p>");
    zip.file("posts/102.paid-post.html", "<p>Paid body text</p>");
    return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
  }

  it("discovers posts from posts.csv — paid posts are first-class items", async () => {
    const blobs = new FakeBlobs();
    blobs.files.set("quarantine/ws/export.zip", await makeZip());
    const provider = createSubstackExportProvider();
    const conn: ConnectionRef = { id: "conn_x", provider: "substack_export", handle: "quarantine/ws/export.zip" };
    const drafts = await provider.discover(conn, { fetch: new FakeFetch(), blobs });
    expect(drafts).toHaveLength(2);
    expect(drafts.find((d) => d.externalId === "102")?.access).toBe("free"); // export = the lossless paid path
    expect(drafts[0]!.remoteChangeKey).toMatch(/^sha256:/); // file-hash change key
  });

  it("fetches a post body out of the zip (no network)", async () => {
    const blobs = new FakeBlobs();
    blobs.files.set("quarantine/ws/export.zip", await makeZip());
    const provider = createSubstackExportProvider();
    const conn: ConnectionRef = { id: "conn_x", provider: "substack_export", handle: "quarantine/ws/export.zip" };
    const out = await provider.fetch(
      { externalId: "102", title: "Paid post", url: null, date: "2025-11-02", wordCount: null, access: "free", remoteChangeKey: null },
      conn,
      { fetch: new FakeFetch(), blobs },
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(new TextDecoder().decode(out.body.bytes)).toContain("Paid body text");
  });

  it("reports posts.csv-missing verbatim with the export remedy", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "not an export");
    const blobs = new FakeBlobs();
    blobs.files.set("q", new Uint8Array(await zip.generateAsync({ type: "uint8array" })));
    const provider = createSubstackExportProvider();
    await expect(
      provider.discover({ id: "c", provider: "substack_export", handle: "q" }, { fetch: new FakeFetch(), blobs }),
    ).rejects.toMatchObject({ message: expect.stringContaining("posts.csv"), remedy: expect.stringContaining("Export") });
  });
});

describe("url provider", () => {
  it("emits exactly one discovery row and flags a paywalled page as partial at fetch", async () => {
    const fetch = new FakeFetch().on("https://blog.example.com/post", () => ({
      ok: true,
      status: 200,
      finalUrl: "https://blog.example.com/post",
      contentType: "text/html",
      headers: { etag: '"v1"' },
      bytes: enc(
        `<html><head><title>T</title></head><body><article><p>Body</p>` +
          `<div class="paywall">Subscribe to continue reading</div></article></body></html>`,
      ),
    }));
    const provider = createUrlProvider();
    const conn: ConnectionRef = { id: "c", provider: "url", handle: "https://blog.example.com/post" };
    const drafts = await provider.discover(conn, { fetch });
    expect(drafts).toHaveLength(1);
    const out = await provider.fetch(drafts[0]!, conn, { fetch });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.body.meta.paywalled).toBe(true);
      expect(out.body.meta.etag).toBe('"v1"');
      // Readability-class extraction: chrome stripped, article kept.
      const html = new TextDecoder().decode(out.body.bytes);
      expect(html).toContain("Body");
      expect(html).not.toContain("<title>");
    }
  });
});

describe("footnote normalization", () => {
  it("rewrites Substack footnote markup into [^n] refs + definitions", () => {
    const html =
      `<p>Text<sup><a class="footnote-anchor" href="#footnote-1">1</a></sup> more</p>` +
      `<div class="footnote"><a href="#footnote-1">1</a> <div class="footnote-content">The note text</div></div>`;
    const out = rewriteFootnotes(html);
    expect(out).toContain("[^1]");
    expect(out).toContain("[^1]: The note text");
    expect(out).not.toContain('class="footnote"');
  });
});

describe("sync engine", () => {
  const conn = (over?: Partial<ConnectionRef>): ConnectionRef => ({
    id: "conn_1",
    provider: "substack",
    handle: "example.substack.com",
    autoIncludeNew: true,
    ...over,
  });

  const wiredFetch = (archive: unknown, bodies: Record<string, unknown>) => {
    const fetch = new FakeFetch().json(
      "https://example.substack.com/api/v1/archive",
      archive,
    );
    for (const [slug, body] of Object.entries(bodies)) {
      fetch.json(`https://example.substack.com/api/v1/posts/${slug}`, body);
    }
    return fetch;
  };

  it("AC-I-A: an updated_at bump WITHOUT a body change produces zero new versions", async () => {
    const provider = createSubstackProvider();
    const store = new InMemoryStore();
    const fetch = wiredFetch(
      [post({ id: 1, slug: "a", updated_at: "2025-12-02T00:00:00.000Z" })],
      { a: postBody("<p>Same body</p>") },
    );
    const r1 = await syncConnection(conn(), provider, deps(fetch, store));
    expect(r1.newVersions).toBe(1);
    const item = store.items[0]!;

    // Second sync: updated_at bumped, body identical → conditional re-fetch, hash decides.
    const fetch2 = wiredFetch(
      [post({ id: 1, slug: "a", updated_at: "2025-12-03T00:00:00.000Z" })],
      { a: postBody("<p>Same body</p>") },
    );
    const r2 = await syncConnection(conn(), provider, deps(fetch2, store));
    expect(r2.newVersions).toBe(0);
    expect(store.versionCount(item.id)).toBe(1); // timestamp-only churn → no new Sample version
    expect(item.remoteChangeKey).toBe("updated_at:2025-12-03T00:00:00.000Z");
  });

  it("a changed body produces a new content-addressed version; an unchanged sync produces none", async () => {
    const provider = createSubstackProvider();
    const store = new InMemoryStore();
    const fetch = wiredFetch([post({ id: 1, slug: "a" })], { a: postBody("<p>V1 body</p>") });
    await syncConnection(conn(), provider, deps(fetch, store));
    const item = store.items[0]!;

    // No change at all → skipped entirely (remote key match → zero fetches of bodies).
    const fetchSame = wiredFetch([post({ id: 1, slug: "a" })], { a: postBody("<p>V1 body</p>") });
    const r = await syncConnection(conn(), provider, deps(fetchSame, store));
    expect(r.skippedUnchanged).toBe(1);
    expect(fetchSame.urlsMatching(/api\/v1\/posts\//)).toHaveLength(0);

    // Body actually changed → new version.
    const fetchNew = wiredFetch(
      [post({ id: 1, slug: "a", updated_at: "2025-12-05T00:00:00.000Z" })],
      { a: postBody("<p>V2 body different</p>") },
    );
    const r2 = await syncConnection(conn(), provider, deps(fetchNew, store));
    expect(r2.newVersions).toBe(1);
    expect(store.versionCount(item.id)).toBe(2);
    expect(store.head(item.id)!.document).toContain("V2 body different");
    expect(store.head(item.id)!.document).toMatch(/^---\nrhema: 1/); // canonical front-matter
    expect(store.head(item.id)!.document).toContain("content_sha256:");
    expect(store.head(item.id)!.document).toContain("quality: clean");
  });

  it("removed_remote: a vanished item is badged and its last-good version retained", async () => {
    const provider = createSubstackProvider();
    const store = new InMemoryStore();
    const fetch = wiredFetch([post({ id: 1, slug: "a" })], { a: postBody("<p>Body</p>") });
    await syncConnection(conn(), provider, deps(fetch, store));
    const item = store.items[0]!;
    expect(item.state).toBe("included");

    const fetchGone = wiredFetch([], {});
    const r = await syncConnection(conn(), provider, deps(fetchGone, store));
    expect(r.removedRemote).toBe(1);
    expect(item.state).toBe("removed_remote");
    expect(store.head(item.id)).toBeDefined(); // bytes + version retained (REQ-INGEST-9)
  });

  it("paywalled items list as omitted and are never fetched; the remedy names the export", async () => {
    const provider = createSubstackProvider();
    const store = new InMemoryStore();
    const fetch = wiredFetch([post({ id: 9, slug: "paid", audience: "only_paid" })], {});
    const r = await syncConnection(conn(), provider, deps(fetch, store));
    expect(r.added).toBe(1);
    const item = store.items[0]!;
    expect(item.state).toBe("omitted");
    expect(item.access).toBe("paywalled");
    expect(fetch.urlsMatching(/api\/v1\/posts\/paid/)).toHaveLength(0); // never fetched
  });

  it("auto-sync never auto-includes: new items land 'new' even when the connection auto-includes", async () => {
    const provider = createSubstackProvider();
    const store = new InMemoryStore();
    const fetch = wiredFetch([post({ id: 1, slug: "a" })], { a: postBody("<p>B</p>") });
    const r = await syncConnection(conn(), provider, deps(fetch, store), { auto: true });
    expect(r.newVersions).toBe(0);
    expect(store.items[0]!.state).toBe("new"); // REQ-INGEST-7
  });

  it("omitted items are re-discovered but never fetched; toggling include picks them up", async () => {
    const provider = createSubstackProvider();
    const store = new InMemoryStore();
    const c = conn({ autoIncludeNew: false });
    const fetch = wiredFetch([post({ id: 1, slug: "a" })], { a: postBody("<p>B</p>") });
    await syncConnection(c, provider, deps(fetch, store));
    const item = store.items[0]!;
    expect(item.state).toBe("new");
    expect(fetch.urlsMatching(/api\/v1\/posts\//)).toHaveLength(0); // confirm-before-fetch

    // The user includes it → the next sync fetches.
    await store.setItemState(item.id, "included");
    const fetch2 = wiredFetch([post({ id: 1, slug: "a" })], { a: postBody("<p>B</p>") });
    const r2 = await syncConnection(c, provider, deps(fetch2, store));
    expect(r2.newVersions).toBe(1);
  });

  it("provider errors surface verbatim with a remedy on the connection; last good stays", async () => {
    const provider = createSubstackProvider();
    const store = new InMemoryStore();
    const fetch = new FakeFetch().on("https://example.substack.com/api/v1/archive", () => ({
      ok: false,
      status: 404,
      reason: "archive not found (404)",
      denyReason: "status",
    })).on("https://example.substack.com/feed", () => ({
      ok: false,
      status: 500,
      reason: "feed exploded",
    }));
    const r = await syncConnection(conn(), provider, deps(fetch, store));
    expect(r.errors).toHaveLength(1);
    const stored = store.connectionErrors.get("conn_1")!;
    expect(stored).toContain("feed exploded"); // verbatim message
    expect(stored).toContain("—"); // message — remedy shape (REQ-INGEST-11)
  });
});
