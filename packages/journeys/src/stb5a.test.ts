// STB.5a — the helper half's unit coverage: the REQ-ARCH-33 marker scan (with a drift pin against
// the repo's canonical sentinel list), the committed Substack export-zip fixture (the AC-I-A
// change-key claim — a post_date-only edit must leave the post file's bytes untouched), the CSL
// fixture, and the quiet-window arithmetic pinned to the shipped contracts seam.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { inQuietHours, quietHoursEnd, type NotificationPrefs } from "@rhema/contracts";
import {
  CITE_KEY,
  PROTOCOL_MARKERS,
  buildSubstackExportZip,
  citationDraft,
  cslJsonBibliography,
  deferredVisibleAt,
  findProtocolMarkers,
  findProtocolMarkersInBytes,
  quietWindowUtc,
  substackFixturePosts,
} from "./stb5a-helpers.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("PROTOCOL_MARKERS", () => {
  it("matches the repo's canonical sentinel list (scripts/lib/protocol-markers.mjs)", () => {
    const src = readFileSync(join(repoRoot, "scripts/lib/protocol-markers.mjs"), "utf8");
    const canonical = [...src.matchAll(/"([^"]+)"/g)]
      .map((m) => m[1]!)
      .filter((s) => /RHEMA|rhema:/.test(s));
    expect([...PROTOCOL_MARKERS].sort()).toEqual(canonical.sort());
  });
  it("finds markers in text and bytes; clean payloads pass", () => {
    expect(findProtocolMarkers("hello world")).toEqual([]);
    expect(findProtocolMarkers("x RHEMA-PROTOCOL-SECRET y")).toEqual(["RHEMA-PROTOCOL-SECRET"]);
    expect(findProtocolMarkersInBytes(new TextEncoder().encode("BEGIN-RHEMA-RUBRIC"))).toEqual([
      "BEGIN-RHEMA-RUBRIC",
    ]);
    expect(findProtocolMarkersInBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff]))).toEqual([]);
  });
});

describe("buildSubstackExportZip", () => {
  it("writes posts.csv + one html file per post the provider can read", async () => {
    const posts = substackFixturePosts();
    const zip = await JSZip.loadAsync(await buildSubstackExportZip(posts));
    const csv = await zip.file("posts.csv")?.async("string");
    expect(csv).toBeDefined();
    const header = csv!.split("\n")[0]!;
    expect(header).toContain("post_id");
    expect(header).toContain("canonical_url");
    for (const p of posts) {
      expect(csv).toContain(p.postId);
      const body = await zip.file(`posts/${p.postId}.${p.slug}.html`)?.async("string");
      expect(body).toBe(p.bodyHtml);
    }
  });
  it("the AC-I-A re-sync variant: bumping only post_date leaves every post file byte-identical", async () => {
    const posts = substackFixturePosts();
    const sha = async (bytes: Uint8Array, name: string): Promise<string> => {
      const zip = await JSZip.loadAsync(bytes);
      const file = zip.file(`posts/${name}`);
      expect(file, name).toBeDefined();
      return createHash("sha256").update(await file!.async("uint8array")).digest("hex");
    };
    const a = await buildSubstackExportZip(posts);
    const b = await buildSubstackExportZip(posts, { postDate: () => "2027-01-01T00:00:00.000Z" });
    for (const p of posts) {
      const name = `${p.postId}.${p.slug}.html`;
      expect(await sha(a, name)).toEqual(await sha(b, name));
    }
    // …while the index row DOES move (the provider's discovery reads it).
    const csvB = await JSZip.loadAsync(b);
    expect(await csvB.file("posts.csv")?.async("string")).toContain("2027-01-01");
  });
});

describe("the citeproc fixture", () => {
  it("the bibliography is valid csl-json keyed by the draft's citation", () => {
    const items = JSON.parse(cslJsonBibliography()) as { id: string; author: { family: string }[] }[];
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(CITE_KEY);
    expect(citationDraft()).toContain(`[@${CITE_KEY}]`);
    expect(citationDraft().split(/\s+/).length).toBeLessThan(200);
  });
});

describe("quietWindowUtc / deferredVisibleAt (the shipped contracts seam)", () => {
  it("the armed window is active at arm time and its end equals quietHoursEnd", () => {
    const now = new Date("2026-10-05T14:23:00Z");
    const w = quietWindowUtc(now, 180);
    expect(w.qhStart).toBe("14:23");
    expect(w.qhEnd).toBe("17:23");
    const prefs = { quietHours: { startMinutesUtc: w.startMinutesUtc, endMinutesUtc: w.endMinutesUtc } } as NotificationPrefs;
    expect(inQuietHours(prefs, now)).toBe(true);
    expect(w.endsAt.getTime()).toBe(quietHoursEnd(prefs, now).getTime());
  });
  it("handles the UTC-day wrap", () => {
    const w = quietWindowUtc(new Date("2026-10-05T23:30:00Z"), 180);
    expect(w.qhStart).toBe("23:30");
    expect(w.qhEnd).toBe("02:30");
    expect(w.endsAt.getUTCDate()).toBe(6);
    expect(w.endsAt.getUTCHours()).toBe(2);
    expect(w.endsAt.getUTCMinutes()).toBe(30);
  });
  it("deferredVisibleAt answers the window's end inside, null outside", () => {
    const now = new Date("2026-10-05T14:00:00Z");
    const w = quietWindowUtc(now, 120);
    const inside = deferredVisibleAt(w.startMinutesUtc, w.endMinutesUtc, new Date("2026-10-05T15:00:00Z"));
    expect(inside?.toISOString()).toBe("2026-10-05T16:00:00.000Z");
    const outside = deferredVisibleAt(w.startMinutesUtc, w.endMinutesUtc, new Date("2026-10-05T17:00:00Z"));
    expect(outside).toBeNull();
  });
});
