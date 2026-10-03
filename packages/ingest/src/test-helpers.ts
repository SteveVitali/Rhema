// Test fakes for the ingest suite — in-memory SyncStore, a scripted FetchPort, a fake ConvertPort.
// Every fetch is recorded (the "discovery never fetches bodies" assertion inspects the call log).

import type {
  BlobPort,
  ConvertPort,
  DiscoveredDraft,
  ExistingItem,
  FetchPort,
  FetchResult,
  SyncStore,
  WriteSampleArgs,
} from "./index.js";
import { sha256Hex } from "@rhema/contracts";

export interface FetchCall {
  readonly url: string;
  readonly accept?: readonly string[];
}

export class FakeFetch implements FetchPort {
  readonly calls: FetchCall[] = [];
  private readonly routes = new Map<string, (url: string) => FetchResult>();

  /** Register a handler; matched by prefix. Handlers receive the full URL. */
  on(prefix: string, handler: (url: string) => FetchResult): this {
    this.routes.set(prefix, handler);
    return this;
  }

  /** Register a JSON body at a prefix. */
  json(prefix: string, body: unknown): this {
    return this.on(prefix, () => ({
      ok: true,
      status: 200,
      finalUrl: prefix,
      contentType: "application/json",
      headers: {},
      bytes: new TextEncoder().encode(JSON.stringify(body)),
    }));
  }

  urlsMatching(re: RegExp): string[] {
    return this.calls.map((c) => c.url).filter((u) => re.test(u));
  }

  async get(url: string, opts?: { accept?: readonly string[] }): Promise<FetchResult> {
    this.calls.push({ url, accept: opts?.accept });
    for (const [prefix, handler] of this.routes) {
      if (url.startsWith(prefix)) return handler(url);
    }
    return { ok: false, status: 404, reason: `no route for ${url}` };
  }
}

export class FakeConvert implements ConvertPort {
  /** markdown override per fetch (keyed by a substring of the decoded bytes). */
  readonly overrides: [string, string][] = [];
  async convert(bytes: Uint8Array): Promise<{
    markdown: string;
    quality: "clean";
    qualityNotes: string[];
    counts: { words: number };
  }> {
    const text = new TextDecoder().decode(bytes);
    for (const [needle, md] of this.overrides) {
      if (text.includes(needle)) {
        return { markdown: md, quality: "clean", qualityNotes: [], counts: { words: md.split(/\s+/).length } };
      }
    }
    // Default: strip tags to text — deterministic "conversion" for the fixtures.
    const markdown = text
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      markdown,
      quality: "clean",
      qualityNotes: [],
      counts: { words: markdown.split(/\s+/).filter(Boolean).length },
    };
  }
}

export class FakeBlobs implements BlobPort {
  readonly files = new Map<string, Uint8Array>();
  async read(handle: string): Promise<Uint8Array | null> {
    return this.files.get(handle) ?? null;
  }
}

/** The in-memory item — ExistingItem's fields, mutable (the store owns the rows). */
export interface StoredItem {
  id: string;
  connectionId: string;
  externalId: string | null;
  state: string;
  remoteChangeKey: string | null;
  currentSampleId: string | null;
  contentSha256: string | null;
  access: string | null;
  url: string | null;
  title: string | null;
  date: string | null;
  wordCount: number | null;
}

export class InMemoryStore implements SyncStore {
  readonly items: StoredItem[] = [];
  readonly versions = new Map<string, { n: number; sample: WriteSampleArgs }[]>();
  readonly connectionErrors = new Map<string, string | null>();
  readonly syncs = new Map<string, Date>();
  private counter = 0;

  async listItems(connectionId: string): Promise<ExistingItem[]> {
    return this.items.filter((i) => i.connectionId === connectionId);
  }

  async createItem(connectionId: string, draft: DiscoveredDraft, state: string): Promise<StoredItem> {
    const item: StoredItem = {
      id: `item_${++this.counter}`,
      connectionId,
      externalId: draft.externalId,
      state,
      remoteChangeKey: draft.remoteChangeKey,
      currentSampleId: null,
      contentSha256: null,
      access: draft.access,
      url: draft.url,
      title: draft.title,
      date: draft.date,
      wordCount: draft.wordCount,
    };
    this.items.push(item);
    this.versions.set(item.id, []);
    return item;
  }

  async setItemState(itemId: string, state: string): Promise<void> {
    const it = this.items.find((i) => i.id === itemId);
    if (it) it.state = state;
  }

  async setRemoteChangeKey(itemId: string, key: string | null): Promise<void> {
    const it = this.items.find((i) => i.id === itemId);
    if (it) it.remoteChangeKey = key;
  }

  async setItemMeta(
    itemId: string,
    meta: Pick<DiscoveredDraft, "title" | "url" | "date" | "wordCount" | "access">,
  ): Promise<void> {
    const it = this.items.find((i) => i.id === itemId);
    if (it) {
      it.title = meta.title;
      it.url = meta.url;
      it.date = meta.date;
      it.wordCount = meta.wordCount;
      it.access = meta.access;
    }
  }

  async nextVersionN(itemId: string): Promise<number> {
    return (this.versions.get(itemId)?.length ?? 0) + 1;
  }

  async writeSample(itemId: string, n: number, sample: WriteSampleArgs): Promise<void> {
    const it = this.items.find((i) => i.id === itemId)!;
    this.versions.get(itemId)!.push({ n, sample });
    it.currentSampleId = `sv_${itemId}_${n}`;
    it.contentSha256 = sample.contentSha256;
    it.state = "included";
  }

  async setConnectionError(connectionId: string, error: string | null): Promise<void> {
    this.connectionErrors.set(connectionId, error);
  }

  async setConnectionSynced(connectionId: string, at: Date): Promise<void> {
    this.syncs.set(connectionId, at);
  }

  versionCount(itemId: string): number {
    return this.versions.get(itemId)?.length ?? 0;
  }

  head(itemId: string): WriteSampleArgs | undefined {
    const v = this.versions.get(itemId);
    return v?.[v.length - 1]?.sample;
  }
}

export const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
export { sha256Hex };
