// 249a R7PUB.1 (REQ-PUB-2; REQ-GROWTH-3) — the ONE declaration of the landing hero-recording
// slot's asset paths and size limits. Three readers, one source of truth:
//
//   - apps/web (server.ts + marketing.tsx): the asset route + the slot's markup (video vs
//     placeholder, poster path, reserved aspect).
//   - packages/journeys `hero-capture.ts` (250_R7DEP.2's committed capture recipe): the
//     encode targets + the limits check.
//   - the tests: the slot states, the limits, and the licence declaration's path agreement.
//
// The clip + poster land at `apps/web/public/media/<file>` and serve immutable at
// `/assets/media/<file>` — committed by 250, never by the dry run (the recipe's --out is a
// scratch dir). The recording shows the sanitized corpus tour, so the asset rides the
// ADR-127 corpus carve-out (declared in LICENSES.md + licenses.exceptions.json).

export const HERO_RECORDING = {
  /** The committed clip's repo path relative to `apps/web/public/` — what 250 commits. */
  clipLocalRel: "media/hero-tour.mp4",
  /** The committed poster frame's repo path relative to `apps/web/public/`. */
  posterLocalRel: "media/hero-tour-poster.jpg",
  /** The clip's served URL (the web `/assets/media/:file` route). */
  clipUrl: "/assets/media/hero-tour.mp4",
  /** The poster frame's served URL. */
  posterUrl: "/assets/media/hero-tour-poster.jpg",
  /** REQ-GROWTH-3: the loop must not exceed 15 s. */
  maxSeconds: 15,
  /** REQ-GROWTH-3: the clip must not exceed 2 MB. */
  maxBytes: 2 * 1024 * 1024,
  /** The slot's reserved box (CSS `aspect-ratio`) — identical in both states so CLS is 0. */
  aspectRatio: "16 / 9",
  /** The encode geometry the recipe targets (a 16:9 frame inside the hero column). */
  width: 1280,
  height: 720,
} as const;

export type HeroRecording = typeof HERO_RECORDING;
