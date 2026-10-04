// STB.5a — the pure helpers + committed fixtures the BL-21/BL-22 live legs share. Everything in
// here is unit-testable without a browser: the protocol-marker scan (REQ-ARCH-33), the Substack
// export-zip builder (the AC-I-A re-sync leg's fixture), the CSL-JSON bibliography + citing draft
// (the citeproc leg), and the quiet-hours window arithmetic (mirrors contracts' inQuietHours /
// quietHoursEnd — a drift test pins the semantic against the shipped implementation).

import JSZip from "jszip";
import { quietHoursEnd, inQuietHours, type NotificationPrefs } from "@rhema/contracts";

// ---- REQ-ARCH-33 marker scan ----------------------------------------------------------------
// The same sentinel list scripts/lib/protocol-markers.mjs exports (the public-safe CI gate). The
// journeys package cannot import a .mjs repo script, so the list is duplicated here and a unit
// test reads the script file to catch drift.

export const PROTOCOL_MARKERS: readonly string[] = [
  "RHEMA-PROTOCOL-SECRET",
  "BEGIN-RHEMA-RUBRIC",
  "BEGIN-RHEMA-CALIBRATION",
  "rhema:protocol-only",
];

export function findProtocolMarkers(text: string, markers: readonly string[] = PROTOCOL_MARKERS): string[] {
  if (text.length === 0) return [];
  return markers.filter((m) => text.includes(m));
}

/** Scan binary artifact bytes (an export download, the account zip) for leaked protocol markers. */
export function findProtocolMarkersInBytes(bytes: Uint8Array): string[] {
  return findProtocolMarkers(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
}

// ---- the Substack export-zip fixture (D-P1.15-1 / AC-I-A) ------------------------------------
// A Substack "export" zip is `posts.csv` (the index) + `posts/<post_id>.<slug>.html` (the bodies).
// The provider's change key is the post file's content hash — a re-sync where only `post_date`
// moved still produces the same hash ⇒ zero new `sample_versions` (the leg's claim).

export interface SubstackPost {
  readonly postId: string;
  readonly slug: string;
  readonly title: string;
  /** canonical_url column value (discovery reads it for the item's url). */
  readonly url?: string;
  /** post_date column value — the re-sync fixture bumps ONLY this field. */
  readonly postDate?: string;
  readonly bodyHtml: string;
}

/** RFC-4180 field escape (the fixture's titles carry no quotes, but the helper is honest). */
function csvField(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export async function buildSubstackExportZip(
  posts: readonly SubstackPost[],
  opts: { readonly postDate?: (p: SubstackPost) => string } = {},
): Promise<Uint8Array> {
  const zip = new JSZip();
  const header = "post_id,title,slug,canonical_url,post_date,is_published,audience";
  const lines = posts.map((p) =>
    [
      p.postId,
      csvField(p.title),
      p.slug,
      p.url ?? `https://journey.substack.com/p/${p.slug}`,
      opts.postDate?.(p) ?? p.postDate ?? "2026-09-01T00:00:00.000Z",
      "true",
      "everyone",
    ].join(","),
  );
  zip.file("posts.csv", [header, ...lines].join("\n") + "\n");
  for (const p of posts) {
    zip.file(`posts/${p.postId}.${p.slug}.html`, p.bodyHtml);
  }
  return new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}

/** The two-post fixture corpus (enough substance for a clean conversion + a paid-access row is
 *  deliberately absent — paid posts ride the same export path but keep the leg's surface small). */
export function substackFixturePosts(): readonly SubstackPost[] {
  return [
    {
      postId: "900001",
      slug: "on-clear-arguments",
      title: "On clear arguments",
      bodyHtml:
        `<html><body><p>An argument earns its keep only when its warrant survives the reader's ` +
        `first objection. The habit worth cultivating is the boring one: say the claim, name the ` +
        `evidence, and concede the strongest counter before the reader supplies it. Prose that does ` +
        `these three things in that order reads as honest even when it is wrong.</p>` +
        `<p>The second habit is subtraction. Every sentence that repeats the point in a softer voice ` +
        `dilutes the one that made it plainly. Cut the echo.</p></body></html>`,
    },
    {
      postId: "900002",
      slug: "notes-on-revision",
      title: "Notes on revision",
      bodyHtml:
        `<html><body><p>Revision is not polish; it is the discovery of what the draft was trying to ` +
        `say. The first pass finds the argument; the second removes everything that merely ` +
        `announced it. What survives is usually half the length and twice as clear.</p>` +
        `<p>Read the draft aloud once. Every stumble marks a sentence that was carrying more than ` +
        `its share of the load.</p></body></html>`,
    },
  ];
}

// ---- the citeproc leg (D-P1.18-1b) -----------------------------------------------------------
// One CSL-JSON item + a draft that cites it via [@journey2026stb5a]. The bibliography rides the
// api's POST /projects/:id/bibliography (format 'csl-json'); the export's citeproc pass renders the
// citation in the md output.

export const CITE_KEY = "journey2026stb5a";

export function cslJsonBibliography(): string {
  return JSON.stringify([
    {
      id: CITE_KEY,
      type: "book",
      title: "The Revision Ledger",
      author: [{ family: "Vale", given: "Adele" }],
      issued: { "date-parts": [[2024]] },
      publisher: "Meridian Press",
    },
  ]);
}

/** The ≤200-word citing draft — citeproc renders "[@key]" into the style's citation form. */
export function citationDraft(): string {
  return (
    `# Journey citeproc draft\n\n` +
    `The argument here borrows its frame from a published account [@${CITE_KEY}], ` +
    `which describes revision as the discovery of what a draft meant to say. That framing matters ` +
    `because it relocates the work: the writer is not decorating a text but interrogating it.\n\n` +
    `A second paragraph keeps the draft honest — a single citation paragraph would exercise the ` +
    `renderer but not the paragraph flow around it. The bibliography itself arrives through the ` +
    `project's CSL-JSON artifact, never through front-matter.\n`
  );
}

// ---- quiet-hours window arithmetic (D-P1.19-1b) ----------------------------------------------
// Mirrors contracts' inQuietHours/quietHoursEnd EXACTLY: a window that arms at `now` for
// `lengthMinutes` is always active at arm time (start = now's minute-of-day UTC), and its end
// instant is quietHoursEnd's answer for any delivery inside it.

export interface QuietWindow {
  readonly qhStart: string; // HH:MM (UTC) — the form value
  readonly qhEnd: string; // HH:MM (UTC) — the form value
  readonly startMinutesUtc: number;
  readonly endMinutesUtc: number;
  /** the instant the current window ends — what a deferred row's visible_at must equal. */
  readonly endsAt: Date;
}

function hhmm(minutesUtc: number): string {
  const m = ((minutesUtc % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function quietWindowUtc(now: Date, lengthMinutes = 180): QuietWindow {
  const startMinutesUtc = now.getUTCHours() * 60 + now.getUTCMinutes();
  const endMinutesUtc = (startMinutesUtc + lengthMinutes) % 1440;
  const prefs = {
    quietHours: { startMinutesUtc, endMinutesUtc },
  } as NotificationPrefs;
  if (!inQuietHours(prefs, now)) {
    throw new Error(`constructed quiet window is not active at arm time (${hhmm(startMinutesUtc)}→${hhmm(endMinutesUtc)})`);
  }
  return {
    qhStart: hhmm(startMinutesUtc),
    qhEnd: hhmm(endMinutesUtc),
    startMinutesUtc,
    endMinutesUtc,
    endsAt: quietHoursEnd(prefs, now),
  };
}

/** What `visible_at` SHOULD be for a deferrable row written at `deliveredAt` under this window —
 *  the contracts seam, never a second implementation. */
export function deferredVisibleAt(startMinutesUtc: number, endMinutesUtc: number, deliveredAt: Date): Date | null {
  const prefs = { quietHours: { startMinutesUtc, endMinutesUtc } } as NotificationPrefs;
  return inQuietHours(prefs, deliveredAt) ? quietHoursEnd(prefs, deliveredAt) : null;
}
