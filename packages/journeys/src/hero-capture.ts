// 249a R7PUB.1 (REQ-PUB-2, spec §5.6; REQ-GROWTH-3) — the ONE committed capture recipe 250
// runs inside the R7b phase preview to record the landing hero loop in a single pass:
//
//   node packages/journeys/dist/hero-capture.js \
//     --web https://<web>.run.app --expect-sha <deployed tip sha> --out <scratch dir>
//
// What it does, in order:
//   1. Provenance: GET <web>/healthz → build.gitSha must match --expect-sha (gotcha 6 — the
//      recording is only honest against the chain tip it claims).
//   2. SIGNED-IN REFUSAL: the recipe accepts no credential flags and proves it — the browser
//      context must hold ZERO cookies before the walk and zero after. A signed-in session
//      would leak account identity into the committed clip; any session cookie fails closed.
//   3. The logged-out D2.tour walk (248's step set, TOUR_STEPS) at 1440×900 with Playwright
//      recordVideo → a raw .webm.
//   4. ffmpeg encodes the muted loop (no audio stream) at the declared geometry + one poster
//      frame; ffprobe reads the duration.
//   5. checkHeroLimits enforces HERO_RECORDING's ≤15 s / ≤2 MB / muted contract — an
//      over-limit clip fails the run (a seeded over-limit clip fails the unit check too).
//
// The outputs land in --out: hero-tour.mp4, hero-tour-poster.jpg, hero-recording-manifest.json.
// NOTHING is committed here: 250 copies the two artifacts to apps/web/public/media/ (the
// declared HERO_RECORDING paths) and completes the ADR-127 asset row's bytes+sha256.

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { HERO_RECORDING } from "@rhema/contracts";
import { TOUR_STEPS } from "./r7legs.js";

const TOUR_ESSAY = "structure-of-political-difference";

export interface HeroLimits {
  readonly durationS: number;
  readonly bytes: number;
  /** An audio stream means the clip is not truly muted. */
  readonly hasAudio: boolean;
}

/** The REQ-GROWTH-3 limits check, pure — a seeded over-limit clip must fail. */
export function checkHeroLimits(m: HeroLimits): string[] {
  const out: string[] = [];
  if (!(m.durationS > 0)) out.push("clip has no measurable duration");
  if (m.durationS > HERO_RECORDING.maxSeconds) {
    out.push(`duration ${m.durationS}s exceeds the ${HERO_RECORDING.maxSeconds}s limit`);
  }
  if (m.bytes > HERO_RECORDING.maxBytes) {
    out.push(`size ${m.bytes}B exceeds the ${HERO_RECORDING.maxBytes}B limit`);
  }
  if (m.hasAudio) out.push("clip carries an audio stream — the loop must be muted");
  return out;
}

/** The served markup contract for the slot's clip arm (the looping half of the limits check):
 *  muted + loop + playsinline + preload="none" + a declared poster, inside the reserved box;
 *  no `autoplay` (the island arms it) and no inline `src` on the source (lazy). */
export function checkHeroMarkup(html: string): string[] {
  const out: string[] = [];
  const clipArm = /<video[^>]*data-hero-video[^>]*>/.test(html);
  const placeholderArm = /data-hero-placeholder/.test(html);
  if (!/data-hero-slot/.test(html)) out.push("landing renders no [data-hero-slot] box");
  if (!clipArm && !placeholderArm) out.push("the slot renders neither the clip nor the placeholder");
  if (clipArm) {
    const tag = (/<video[^>]*data-hero-video[^>]*>/.exec(html)?.[0] ?? "").toLowerCase();
    for (const attr of ["muted", "loop", "playsinline", "poster=", 'preload="none"']) {
      if (!tag.includes(attr)) out.push(`hero <video> misses ${attr}`);
    }
    if (/\bautoplay\b/i.test(tag)) out.push("hero <video> carries autoplay — the island must arm it");
    if (/<source[^>]*\ssrc=/.test(html)) out.push("hero <source> carries an inline src — not lazy");
  }
  return out;
}

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function probeClip(file: string): Promise<{ durationS: number; hasAudio: boolean }> {
  const probe = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file],
    { encoding: "utf-8" },
  );
  if (probe.status !== 0) throw new Error(`ffprobe failed: ${probe.stderr}`);
  const parsed = JSON.parse(probe.stdout) as {
    format?: { duration?: string };
    streams?: { codec_type?: string }[];
  };
  return {
    durationS: Number(parsed.format?.duration ?? NaN),
    hasAudio: (parsed.streams ?? []).some((s) => s.codec_type === "audio"),
  };
}

async function main(): Promise<number> {
  const web = arg("--web")?.replace(/\/+$/, "");
  const expectSha = arg("--expect-sha");
  const outDir = arg("--out");
  if (!web || !expectSha || !outDir) {
    console.error("usage: hero-capture.js --web <base> --expect-sha <sha> --out <dir>");
    return 2;
  }
  // Signed-in refusal, static half: the recipe takes no session/invite/credential inputs at all.
  for (const banned of ["--session", "--invite-code", "--cookie", "--token", "--email"]) {
    if (process.argv.includes(banned)) {
      console.error(`refused: ${banned} would sign the capture in — the loop is logged-out only`);
      return 2;
    }
  }
  mkdirSync(outDir, { recursive: true });
  const health = (await (await fetch(`${web}/healthz`)).json()) as {
    build?: { gitSha?: string | null };
  };
  const observed = health.build?.gitSha ?? "";
  if (!observed.startsWith(expectSha)) {
    console.error(`provenance: expected ${expectSha}, /healthz reports ${observed || "∅"}`);
    return 2;
  }

  const videoDir = join(outDir, "raw-video");
  mkdirSync(videoDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: videoDir, size: { width: HERO_RECORDING.width, height: HERO_RECORDING.height } },
  });
  // Signed-in refusal, live half: zero cookies before the walk; a planted session would appear here.
  if ((await context.cookies()).length > 0) {
    await browser.close();
    console.error("refused: the capture context already carries cookies — never record signed-in");
    return 2;
  }
  const page = await context.newPage();
  try {
    await page.goto(`${web}/demo/${TOUR_ESSAY}?tour=published`, { waitUntil: "domcontentloaded" });
    for (const [i, step] of TOUR_STEPS.entries()) {
      const mark = page.locator(`[data-demo-tour-step="${step.id}"]`);
      await mark.waitFor({ timeout: 30_000 });
      await page.waitForTimeout(950); // a readable beat per step — keeps the loop under 15 s
      if (i < TOUR_STEPS.length - 1) {
        await page.locator("[data-demo-tour-next]").first().click();
      }
    }
  } finally {
    await context.close(); // flushes the webm
    await browser.close();
  }
  // Signed-in refusal, post-walk: the demo path must never mint a session cookie.
  const leaked = (await context.cookies()).filter((c) => /session|token|auth/i.test(c.name));
  if (leaked.length > 0) {
    console.error(`refused: ${leaked.length} auth-shaped cookie(s) captured — nothing is recorded`);
    return 2;
  }

  const raw = readdirSync(videoDir).find((f) => f.endsWith(".webm"));
  if (!raw) {
    console.error("no recorded video produced");
    return 2;
  }
  const clip = join(outDir, "hero-tour.mp4");
  const poster = join(outDir, "hero-tour-poster.jpg");
  const enc = spawnSync(
    "ffmpeg",
    [
      "-y", "-i", join(videoDir, raw),
      "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-vf", `scale=${HERO_RECORDING.width}:${HERO_RECORDING.height}`,
      "-crf", "28", "-movflags", "+faststart",
      "-t", String(HERO_RECORDING.maxSeconds),
      clip,
    ],
    { encoding: "utf-8" },
  );
  if (enc.status !== 0) throw new Error(`ffmpeg encode failed: ${enc.stderr.slice(-800)}`);
  const post = spawnSync(
    "ffmpeg",
    ["-y", "-i", clip, "-ss", "0.5", "-frames:v", "1", "-q:v", "4", poster],
    { encoding: "utf-8" },
  );
  if (post.status !== 0) throw new Error(`ffmpeg poster failed: ${post.stderr.slice(-800)}`);

  const measured = await probeClip(clip);
  const limits = checkHeroLimits({ ...measured, bytes: statSync(clip).size });
  const markup = checkHeroMarkup(await (await fetch(`${web}/`)).text());
  const violations = [...limits, ...markup];
  const manifest = {
    capturedAt: new Date().toISOString(),
    web,
    expectSha,
    observedSha: observed,
    clip: { file: "hero-tour.mp4", ...measured, bytes: statSync(clip).size },
    poster: { file: "hero-tour-poster.jpg", bytes: statSync(poster).size },
    commitTo: {
      clip: `apps/web/public/${HERO_RECORDING.clipLocalRel}`,
      poster: `apps/web/public/${HERO_RECORDING.posterLocalRel}`,
    },
    limits: HERO_RECORDING,
    violations,
  };
  writeFileSync(join(outDir, "hero-recording-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  if (violations.length > 0) {
    console.error(`limits/markup violations:\n  ${violations.join("\n  ")}`);
    return 2;
  }
  console.log(`hero clip ${measured.durationS.toFixed(1)}s / ${statSync(clip).size}B → ${clip}`);
  console.log(`poster → ${poster}`);
  console.log(`manifest → ${join(outDir, "hero-recording-manifest.json")}`);
  return 0;
}

// CLI entry — run only when invoked directly (the test imports the pure checks).
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(2);
    });
}
